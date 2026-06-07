"""
AI-NUSS 3.0 — Director Agent (AI导演助手)
基于已生成的 Scene + Screenplay 数据进行二次影视化分析。
调用 DeepSeek 为每个场景生成导演辅助信息 (director_note)。
"""
import json
import asyncio
from typing import Dict, Any, List, Optional
from app.graph.agents.base import BaseAgent


DIRECTOR_SYSTEM_PROMPT = """你是一名专业影视导演顾问。

请根据场景结构化数据生成影视化导演建议。

输出必须为 JSON。

禁止输出 Markdown。

禁止输出解释文字。

必须包含：

emotion
visual_style
camera_plan
lighting
music
pacing
director_comment

camera_plan 返回 3~5 个镜头。

director_comment 不超过 50 字。

## 字段约束
- emotion 可选值: suspense | tense | sad | romantic | warm | action | hopeful | mysterious
- visual_style 可选值: crime_drama | suspense_thriller | realism | romantic_drama | sci_fi | historical | action | fantasy
- visual_style 禁止输出真实导演名字（如诺兰风格、王家卫风格、昆汀风格等）
- camera_plan 镜头类型: wide_shot | medium_shot | close_up | tracking_shot | over_shoulder | handheld | establishing_shot
- pacing 可选值: slow | medium | fast
- lighting: 一句打光描述（如 冷蓝色低照度灯光、暖黄色柔光、逆光轮廓光）
- music: 一句配乐方向（如 低频悬疑氛围、钢琴抒情旋律、紧张鼓点节奏）
- director_comment: 不超过 50 字"""


class DirectorAgent(BaseAgent[Dict[str, Any]]):

    MAX_CONCURRENCY = 5
    _semaphore: Optional[asyncio.Semaphore] = None

    @classmethod
    def _get_sem(cls) -> asyncio.Semaphore:
        if cls._semaphore is None:
            cls._semaphore = asyncio.Semaphore(cls.MAX_CONCURRENCY)
        return cls._semaphore

    @property
    def agent_name(self) -> str:
        return "director_agent"

    @property
    def system_prompt(self) -> str:
        return DIRECTOR_SYSTEM_PROMPT

    # ═══════════════════════════════════════════
    # REAL_PATH — 并发生成全部场景导演建议
    # ═══════════════════════════════════════════

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        scenes: List[Dict] = state.get("scenes", [])
        if not scenes:
            return {"scenes": scenes, "director_version": 1}

        sem = self._get_sem()
        generated = 0
        failed = 0

        async def process_one(scene: Dict) -> Dict:
            """为单个场景生成 director_note，返回更新后的 scene 副本"""
            nonlocal generated, failed
            text_len = len(scene.get("raw_scene_text_block", ""))
            # 跳过极短场景
            if text_len < 10:
                scene["director_note"] = _stub_director_note("文本过短，跳过导演分析")
                return scene

            try:
                async with sem:
                    note = await self._call_llm_for_scene(state, scene)
                scene["director_note"] = note
                generated += 1
            except Exception as e:
                scene["director_note"] = _stub_director_note(f"API异常: {type(e).__name__}")
                failed += 1
            return scene

        tasks = [process_one(s) for s in scenes]
        updated_scenes = await asyncio.gather(*tasks)

        return {
            "scenes": list(updated_scenes),
            "director_version": 1,
            "_director_stats": {"total": len(scenes), "generated": generated, "failed": failed},
        }

    async def _call_llm_for_scene(self, state: Dict, scene: Dict) -> Dict[str, Any]:
        """调用 LLM 为单个场景生成导演建议。返回 director_note 字典。"""
        scene_info = {
            "scene_id": scene.get("scene_number", 0),
            "location": scene.get("location", "未知场景"),
            "time": scene.get("time", "日"),
            "summary": scene.get("summary", "")[:300],
            "characters": scene.get("cast", []),
            "conflict_level": "high" if scene.get("conflict_level", 0) > 0.6 else ("medium" if scene.get("conflict_level", 0) > 0.3 else "low"),
            "beats": [b.get("beat_type", "") for b in scene.get("beats", [])[:5]],
        }

        user_msg = json.dumps(scene_info, ensure_ascii=False, indent=2)

        client = self._get_raw_client(state)
        model = self._get_model_name(state)
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": DIRECTOR_SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.5,
                max_tokens=600,
                timeout=20.0,
            ),
            timeout=25.0,
        )

        content = resp.choices[0].message.content or "{}"
        return _parse_director_json(content)

    # ═══════════════════════════════════════════
    # MOCK_PATH — 确定性 stub
    # ═══════════════════════════════════════════

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        scenes: List[Dict] = state.get("scenes", [])
        for s in scenes:
            s["director_note"] = _stub_director_note("STUB_MODE — 导演分析未执行")
        return {"scenes": scenes, "director_version": 1}


# ═══════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════

def _stub_director_note(reason: str = "") -> Dict[str, Any]:
    """生成默认 stub director_note"""
    return {
        "emotion": "neutral",
        "visual_style": "realism",
        "camera_plan": ["establishing_shot", "medium_shot", "close_up"],
        "lighting": "自然光" if not reason else reason,
        "music": "环境氛围音",
        "pacing": "medium",
        "director_comment": reason if reason else "默认导演建议（非AI生成）",
    }


def _parse_director_json(raw: str) -> Dict[str, Any]:
    """解析 DeepSeek 返回的 JSON，失败则返回 stub"""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = "\n".join(l for l in raw.split("\n") if not l.strip().startswith("```"))
    s = raw.find("{")
    e = raw.rfind("}") + 1
    if s >= 0 and e > s:
        raw = raw[s:e]
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        return _stub_director_note("JSON解析失败")

    # 校验并修复字段
    valid_emotions = {"suspense", "tense", "sad", "romantic", "warm", "action", "hopeful", "mysterious"}
    valid_styles = {"crime_drama", "suspense_thriller", "realism", "romantic_drama", "sci_fi", "historical", "action", "fantasy"}
    valid_shots = {"wide_shot", "medium_shot", "close_up", "tracking_shot", "over_shoulder", "handheld", "establishing_shot"}
    valid_pacing = {"slow", "medium", "fast"}

    # camera_plan: 兼容字符串数组和对象数组两种格式
    raw_plan = result.get("camera_plan") or []
    camera_plan = []
    for item in raw_plan[:5]:
        if isinstance(item, str) and item in valid_shots:
            camera_plan.append(item)
        elif isinstance(item, dict) and item.get("shot") in valid_shots:
            camera_plan.append(item["shot"])

    return {
        "emotion": result.get("emotion", "neutral") if result.get("emotion") in valid_emotions else "neutral",
        "visual_style": result.get("visual_style", "realism") if result.get("visual_style") in valid_styles else "realism",
        "camera_plan": camera_plan or _stub_director_note("镜头计划为空")["camera_plan"],
        "lighting": str(result.get("lighting", "自然光"))[:30],
        "music": str(result.get("music", "环境氛围音"))[:30],
        "pacing": result.get("pacing", "medium") if result.get("pacing") in valid_pacing else "medium",
        "director_comment": str(result.get("director_comment", ""))[:50],
    }
