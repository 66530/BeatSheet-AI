"""
AI-NUSS 3.0 — Screenplay Agent (v4 生产级)
- 处理全部场景(非仅前5场), Semaphore控制并发数
- 每场景独立状态: PENDING/RUNNING/SUCCESS/FAILED
- GenerationStats: total/generated/failed/tokens/latency
- 覆盖率检查: >=90% COMPLETED, >=50% PARTIAL, <50% FAILED
- 短场景(<10字)合并而非静默跳过
"""
import json
import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
from app.graph.agents.base import BaseAgent


BEAT_SYSTEM_PROMPT = """你是专业影视编剧。请将场景文本分解为3-5个戏剧节拍，为每个节拍生成可拍摄的剧本元素。

## 输出格式(严格JSON)
{
  "beats": [
    {
      "beat_type": "setup|reveal|conflict|decision|twist|climax|resolution",
      "summary": "节拍一句话描述",
      "objective": "戏剧目的",
      "emotion": "主导情绪",
      "intensity": 0.0-1.0,
      "cast": ["角色ID"],
      "actions": [{"character_id": "角色ID", "description": "可拍摄动作描述(30-80字)"}],
      "dialogues": [{"speaker_id": "角色ID", "target_id": "角色ID", "line": "对白内容", "emotion": "语气", "subtext": "潜台词"}],
      "voice_overs": [{"character_id": "角色ID", "content": "画外音/旁白内容(20-60字)"}],
      "inner_monologues": [{"character_id": "角色ID", "content": "内心独白内容(15-50字)"}],
      "captions": [{"content": "字幕文字"}],
      "flashbacks": [{"trigger": "触发媒介", "content": "闪回画面描述"}]
    }
  ]
}

## 核心原则
- 动作: Show Don't Tell, 必须可拍摄。禁止心理描述，转为可观察行为
- 对白: 戏剧驱动型，每句话要有潜台词
- voice_overs: 当原文有叙事性旁白/第三人称描述/回忆性叙述/环境介绍时，转为画外音
- inner_monologues: 当原文有角色内心活动(心想/暗想/思忖/感到/意识到)时，转为内心独白
- 每个元素必须标注 character_id 指明执行角色
- 节拍内容必须基于原文，禁止编造"""


@dataclass
class SceneBeatStatus:
    scene_id: str
    scene_number: int = 0
    status: str = "PENDING"
    beats_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    latency: float = 0.0
    error: Optional[str] = None
    skip_reason: Optional[str] = None


@dataclass
class GenerationStats:
    total_scenes: int = 0
    generated_scenes: int = 0
    failed_scenes: int = 0
    skipped_scenes: int = 0
    total_beats: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_api_calls: int = 0
    average_latency: float = 0.0
    total_duration: float = 0.0
    coverage: float = 0.0
    per_scene: List[Dict] = field(default_factory=list)


class ScreenplayAgent(BaseAgent[Dict[str, Any]]):

    MAX_CONCURRENCY = 5
    MIN_TEXT_LENGTH = 10           # < 10 字 → 合并到前一场景
    _semaphore: Optional[asyncio.Semaphore] = None

    @classmethod
    def _get_sem(cls) -> asyncio.Semaphore:
        if cls._semaphore is None:
            cls._semaphore = asyncio.Semaphore(cls.MAX_CONCURRENCY)
        return cls._semaphore

    @property
    def agent_name(self) -> str:
        return "screenplay_agent"

    @property
    def system_prompt(self) -> str:
        return BEAT_SYSTEM_PROMPT

    # ═══════════════════════════════════════════
    # REAL_PATH — 全场景处理 + 统计
    # ═══════════════════════════════════════════

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        raw_scenes: List[Dict] = state.get("scenes", [])
        cast = state.get("master_cast_list", [])
        stats = GenerationStats(total_scenes=len(raw_scenes))
        sem = self._get_sem()

        # — 合并短场景 —
        scenes = self._merge_short_scenes(raw_scenes)

        t0 = time.time()

        async def process_one(scene: Dict) -> SceneBeatStatus:
            sid = scene.get("scene_id", "?")
            snum = scene.get("scene_number", 0)
            status = SceneBeatStatus(scene_id=sid, scene_number=snum, status="RUNNING")

            text = scene.get("raw_scene_text_block", "")
            if len(text) < self.MIN_TEXT_LENGTH:
                status.status = "SKIPPED"
                status.skip_reason = f"文本过短({len(text)}字 < {self.MIN_TEXT_LENGTH})"
                return status

            t_start = time.time()
            try:
                async with sem:
                    result = await self._call_llm_for_scene(state, scene, cast)
                status.latency = round(time.time() - t_start, 2)

                if result.get("tokens_in"): status.input_tokens = result["tokens_in"]
                if result.get("tokens_out"): status.output_tokens = result["tokens_out"]

                beats = result.get("beats", [])
                if beats:
                    for i, b in enumerate(beats):
                        b["beat_id"] = f"B_{sid}_{i+1:02d}"
                        b["scene_id"] = sid
                        b["beat_number"] = i + 1
                        if "cast" not in b or not b["cast"]:
                            b["cast"] = scene.get("cast", [])
                    status.beats_count = len(beats)
                    status.status = "SUCCESS"
                    # 写回场景
                    scene["beats"] = beats
                else:
                    status.status = "FAILED"
                    status.error = "API返回空节拍"
            except Exception as e:
                status.latency = round(time.time() - t_start, 2)
                status.status = "FAILED"
                status.error = f"{type(e).__name__}: {str(e)[:100]}"

            return status

        # — 并发生成全部场景 —
        tasks = [process_one(s) for s in scenes]
        results: List[SceneBeatStatus] = await asyncio.gather(*tasks)

        # — 汇总统计 —
        stats.total_duration = round(time.time() - t0, 2)
        all_beats: List[Dict] = []

        for r in results:
            stats.per_scene.append({
                "scene_id": r.scene_id, "scene_number": r.scene_number,
                "status": r.status, "beats": r.beats_count,
                "tokens_in": r.input_tokens, "tokens_out": r.output_tokens,
                "latency": r.latency,
                "error": r.error, "skip_reason": r.skip_reason,
            })

            if r.status == "SUCCESS":
                stats.generated_scenes += 1
                stats.total_beats += r.beats_count
            elif r.status == "FAILED":
                stats.failed_scenes += 1
            elif r.status == "SKIPPED":
                stats.skipped_scenes += 1

            stats.total_tokens_in += r.input_tokens
            stats.total_tokens_out += r.output_tokens
            if r.status in ("SUCCESS", "FAILED"):
                stats.total_api_calls += 1

        # 提取所有节拍(从场景中收集)
        for s in scenes:
            for b in s.get("beats", []):
                all_beats.append(b)

        latencies = [p.get("latency", 0) for p in stats.per_scene if p.get("latency", 0) > 0]
        stats.average_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0
        stats.coverage = round(stats.generated_scenes / max(stats.total_scenes, 1), 3)

        # — 覆盖率判定 —
        if stats.coverage >= 0.9:
            completion_status = "COMPLETED"
        elif stats.coverage >= 0.5:
            completion_status = "PARTIAL_SUCCESS"
        else:
            completion_status = "FAILED"

        # — Scene Health Dashboard —
        health = self._compute_health(scenes, stats)

        screenplay = self._build_screenplay(scenes, cast)

        return {
            "beats": all_beats,
            "screenplay": screenplay,
            "stats": {
                "total_scenes": stats.total_scenes,
                "generated_scenes": stats.generated_scenes,
                "failed_scenes": stats.failed_scenes,
                "skipped_scenes": stats.skipped_scenes,
                "total_beats": stats.total_beats,
                "total_tokens_in": stats.total_tokens_in,
                "total_tokens_out": stats.total_tokens_out,
                "total_api_calls": stats.total_api_calls,
                "average_latency": stats.average_latency,
                "total_duration": stats.total_duration,
                "coverage": stats.coverage,
                "completion_status": completion_status,
                "per_scene": stats.per_scene,
                "scene_health": health,
            },
            "_completion_status": completion_status,
            "_coverage": stats.coverage,
        }

    async def _call_llm_for_scene(self, state: Dict, scene: Dict, cast_list: List[Dict]) -> Dict:
        """调用 LLM 生成单场景节拍。返回 {beats, tokens_in, tokens_out}"""
        text = scene.get("raw_scene_text_block", "")

        cast_text = "\n".join(
            f"- {c.get('canonical_name','?')} (ID:{c.get('character_id','?')})"
            for c in cast_list[:8]
        )

        client = self._get_raw_client(state)
        model = self._get_model_name(state)
        prompt = f"""场景信息:
- 地点: {scene.get('location','?')}  时间: {scene.get('time','日')}
- 叙事模式: {scene.get('timeline_mode','sequential')}
- 情绪: {scene.get('emotional_tone','中性')}  冲突: {scene.get('conflict_level',0.3)}

角色: {cast_text if cast_text else '无角色信息'}

原文: {text[:1200]}

请分解为3-5个节拍，返回JSON。每个动作和对白标注 character_id。"""

        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": BEAT_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5, max_tokens=2000, timeout=25.0,
            ), timeout=30.0
        )

        content = resp.choices[0].message.content or "{}"
        tokens_in = resp.usage.prompt_tokens if resp.usage else 0
        tokens_out = resp.usage.completion_tokens if resp.usage else 0

        parsed = self._parse_json(content)
        beats = parsed.get("beats", [])

        # 过滤：保留有内容的节拍(含画外音/内心独白)
        valid = []
        for b in beats:
            has_content = (
                (b.get("actions") and len(b["actions"]) > 0) or
                (b.get("dialogues") and len(b["dialogues"]) > 0) or
                (b.get("voice_overs") and len(b["voice_overs"]) > 0) or
                (b.get("inner_monologues") and len(b["inner_monologues"]) > 0)
            )
            if has_content:
                valid.append(b)
        return {"beats": valid, "tokens_in": tokens_in, "tokens_out": tokens_out}

    # ═══════════════════════════════════════════
    # 短场景合并
    # ═══════════════════════════════════════════

    def _merge_short_scenes(self, scenes: List[Dict]) -> List[Dict]:
        """将 < MIN_TEXT_LENGTH 字的场景合并到前一场景"""
        if not scenes:
            return scenes
        merged = []
        for s in scenes:
            text = s.get("raw_scene_text_block", "")
            if len(text) < self.MIN_TEXT_LENGTH and merged:
                # 合并到前一个场景
                prev = merged[-1]
                prev["raw_scene_text_block"] = (prev.get("raw_scene_text_block", "") + "\n" + text).strip()
                prev["summary"] = prev.get("summary", "")[:200]
                # 合并 cast
                prev_cast = set(prev.get("cast", []))
                for cid in s.get("cast", []):
                    prev_cast.add(cid)
                prev["cast"] = list(prev_cast)
            else:
                merged.append(s)
        return merged

    # ═══════════════════════════════════════════
    # MOCK_PATH
    # ═══════════════════════════════════════════

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        return {"beats": [], "screenplay": {}, "stats": {"total_scenes": 0, "coverage": 0}, "_completion_status": "FAILED", "error": "STUB_MODE"}

    # ═══════════════════════════════════════════
    # Scene Health Dashboard
    # ═══════════════════════════════════════════

    def _compute_health(self, scenes: List[Dict], stats: GenerationStats) -> Dict:
        """场景健康度面板"""
        chars_list = [len(s.get("raw_scene_text_block","")) for s in scenes if s.get("raw_scene_text_block")]
        beats_list = [len(s.get("beats",[])) for s in scenes]
        qualities = [s.get("quality",{}).get("quality_score",0) for s in scenes if s.get("quality")]
        event_counts = [len(s.get("key_events",[])) for s in scenes]
        empty_scenes = sum(1 for s in scenes if not s.get("beats"))

        avg_chars = round(sum(chars_list)/len(chars_list)) if chars_list else 0
        avg_beats = round(sum(beats_list)/len(beats_list),1) if beats_list else 0
        avg_quality = round(sum(qualities)/len(qualities),2) if qualities else 0
        avg_events = round(sum(event_counts)/len(event_counts),1) if event_counts else 0
        empty_rate = round(empty_scenes/len(scenes),3) if scenes else 0
        dialogue_density = round(sum(s.get("quality",{}).get("dialogue_hints",0) for s in scenes)/max(sum(chars_list),1)*100,1)

        grade_dist = {"A":0,"B":0,"C":0,"D":0}
        for s in scenes:
            g = s.get("quality",{}).get("grade","D")
            if g in grade_dist: grade_dist[g] += 1

        return {
            "avg_chars": avg_chars,
            "avg_beats": avg_beats,
            "avg_quality": avg_quality,
            "avg_events": avg_events,
            "empty_scene_rate": empty_rate,
            "dialogue_density": dialogue_density,
            "grade_distribution": grade_dist,
            "total_scenes": len(scenes),
            "total_beats": stats.total_beats,
        }

    # ═══════════════════════════════════════════
    # 剧本结构构建
    # ═══════════════════════════════════════════

    def _build_screenplay(self, scenes: List[Dict], cast_list: List[Dict]) -> Dict:
        characters = []
        for c in cast_list:
            chars = {
                "character_id": c.get("character_id", ""),
                "canonical_name": c.get("canonical_name", "?"),
                "role": c.get("role", "supporting"),
                "description": c.get("description", ""),
                "appears_in_scenes": [],
            }
            for s in scenes:
                if c.get("character_id") in s.get("cast", []):
                    chars["appears_in_scenes"].append(s["scene_number"])
            characters.append(chars)

        episodes: Dict[str, Dict] = {}
        for scene in scenes:
            ep_id = scene.get("episode_id", "EP_001")
            if ep_id not in episodes:
                episodes[ep_id] = {"episode_id": ep_id, "episode_number": len(episodes) + 1, "title": f"第{len(episodes)+1}集", "scenes": []}
            beats = scene.get("beats", [])
            episodes[ep_id]["scenes"].append({
                "scene_id": scene["scene_id"], "scene_number": scene["scene_number"],
                "scene_heading": f"第{scene['scene_number']}场  {scene['location']} - {scene['time']}",
                "location": scene["location"], "time": scene["time"],
                "timeline_mode": scene.get("timeline_mode", "sequential"),
                "summary": scene.get("summary", ""), "purpose": scene.get("purpose", ""),
                "emotional_tone": scene.get("emotional_tone", "中性"),
                "conflict_level": scene.get("conflict_level", 0),
                "cast": scene.get("cast", []),
                "segmentation_reason": scene.get("segmentation_reason", {}),
                "raw_text": scene.get("raw_scene_text_block", ""),
                "beat_status": "SUCCESS" if beats else "EMPTY",
                "beats": [{
                    "beat_id": b.get("beat_id", ""), "beat_type": b.get("beat_type", "setup"),
                    "summary": b.get("summary", ""), "emotion": b.get("emotion", ""),
                    "intensity": b.get("intensity", 0.5), "cast": b.get("cast", []),
                    "actions": b.get("actions", []), "dialogues": b.get("dialogues", []),
                    "voice_overs": b.get("voice_overs", []),
                    "inner_monologues": b.get("inner_monologues", []),
                    "captions": b.get("captions", []), "flashbacks": b.get("flashbacks", []),
                } for b in beats],
            })

        return {
            "episodes": sorted(episodes.values(), key=lambda e: e["episode_number"]),
            "character_graph": characters,
            "total_scenes": len(scenes),
            "total_beats": sum(len(s.get("beats", [])) for s in scenes),
        }

    def _parse_json(self, raw: str) -> Dict:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = "\n".join(l for l in raw.split("\n") if not l.strip().startswith("```"))
        s = raw.find("{")
        e = raw.rfind("}") + 1
        if s >= 0 and e > s:
            raw = raw[s:e]
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
