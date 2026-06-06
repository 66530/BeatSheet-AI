"""
AI-NUSS 3.0 — Scene Segmentation Engine (v3)
五类标准分场规则:
  1. location_shift — 物理地理位置变换
  2. time_shift — 同地时间变换
  3. flashback — 意识流回忆与闪回
  4. montage — 空间蒙太奇与意向转场
  5. simultaneous — 多线同时发生

每场输出: location / time / timeline_mode / cast / beats
"""
import re
import json
import asyncio
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
from app.graph.agents.base import BaseAgent, get_deepseek_client
from app.core.config import settings


# ═══════════════════════════════════════════════════════════
# 五类分场检测器
# ═══════════════════════════════════════════════════════════

class SceneSegmentationDetector:
    """
    按优先级检测分场类型:
      1. simultaneous > 2. montage > 3. flashback > 4. location_shift > 5. time_shift
    """

    # —— 1. 物理位置变换 ——
    LOCATION_SHIFT_PATTERNS = [
        (r"(?:推开门?|走出?|走进?|来到|进入|回到|离开|踏入|跨进|迈入)(?:了)?(.{1,12}(?:厅|室|园|房|院|楼|廊|街|场|店|馆|所|房间|卧室|客厅|书房|厨房|大门|门|电梯))", "location_shift"),
        (r"转移到了?\s*(.{1,12}(?:厅|室|园|房|院|楼|廊|街|场|店|馆|所))", "location_shift"),
        (r"INT\.\s*.+", "location_shift"),
        (r"EXT\.\s*.+", "location_shift"),
    ]

    # —— 2. 同地时间变换 ——
    TIME_SHIFT_PATTERNS = [
        (r"(?:(\d+)\s*(?:个?小时?|分钟|天|周|月|年)(?:后|之后|以后|过去了?))", "time_shift"),
        (r"(?:次日|第二天|隔天|翌日|第二天一早|第二天清晨|第二天早上)", "time_shift"),
        (r"(?:夜深了?|夜深人静|半夜|午夜|凌晨)", "time_shift"),
        (r"(?:清晨|早晨|早上|天亮|拂晓|日出)", "time_shift"),
        (r"(?:黄昏|傍晚|日落|暮色|入夜)", "time_shift"),
        (r"(?:转眼间?|一晃|时光飞逝|渐渐|不知不[觉觉])", "time_shift"),
    ]

    # —— 3. 意识流闪回 ——
    FLASHBACK_PATTERNS = [
        (r"(?:思绪|记忆|回忆|脑海).{0,10}(?:回到|飘回|拉回|切[入回]|涌现).{0,10}(?:五年前|三年前|几年前|那[一年天个]|从前|曾经|过去)", "flashback"),
        (r"(?:想起了?|回忆起?|记起)(?:了)?.{0,15}(?:五年前|三年前|几年前|那[一年天个]|从前|曾经)", "flashback"),
        (r"(?:脑海里?浮现|眼前浮现|脑中闪过|记忆[中里]).{0,20}", "flashback"),
        (r"(?:那[一年天].{0,10}(?:的夜晚?|的夏天|的冬天|的秋天|的春天))", "flashback"),
        (r"(?:想起了?|回忆起?).{0,8}(?:第一次|最初|当初|当年)", "flashback"),
        (r"(?:恍惚间?|仿佛.{0,10}(?:看到|听到|回到))", "flashback"),
    ]

    # —— 4. 空间蒙太奇 ——
    MONTAGE_PATTERNS = [
        (r"(?:在.{2,6}(?:流浪|漂泊|奔走|穿梭|来回).{0,20}(?:在.{2,6}(?:搬砖|奔跑|打工|流浪|挣扎|求生)))", "montage"),
        (r"(?:连续|不断|反复|一遍遍|一次次).{0,10}(?:训练|尝试|失败|重复|练习)", "montage"),
        (r"(?:画面.{0,5}(?:切换|闪过|交替|闪现))", "montage"),
        (r"(?:数月后|几年后|数年后|多年后|几周后).{0,15}(?:已经|终于|变成)", "montage"),
        (r"(?:日复一日|年复一年|一天又一天|一夜又一夜)", "montage"),
        (r"(?:快速|飞速|飞快).{0,5}(?:闪过|掠过|剪辑|切换)", "montage"),
    ]

    # —— 5. 多线同时 ——
    SIMULTANEOUS_PATTERNS = [
        (r"(?:就在.{0,15}的同时)", "simultaneous"),
        (r"(?:与此[同时间时]|同一时[间刻]|此时此刻).{0,10}(?:在|另|另一)", "simultaneous"),
        (r"(?:另一边|另一[方面头]|而在).{0,5}(?:在|正在)", "simultaneous"),
        (r"(?:镜头切换|画面一转).{0,10}(?:在|另)", "simultaneous"),
    ]

    @classmethod
    def detect(cls, text: str) -> Tuple[str, str, List[str]]:
        """
        返回: (timeline_mode, location_hint, matched_markers)
        优先级: simultaneous > montage > flashback > location_shift > time_shift
        """
        if not text:
            return "sequential", "", []

        detectors = [
            (cls.SIMULTANEOUS_PATTERNS, "simultaneous"),
            (cls.MONTAGE_PATTERNS, "montage"),
            (cls.FLASHBACK_PATTERNS, "flashback"),
            (cls.LOCATION_SHIFT_PATTERNS, "location_shift"),
            (cls.TIME_SHIFT_PATTERNS, "time_shift"),
        ]

        for patterns, mode in detectors:
            for pattern, _ in patterns:
                m = re.search(pattern, text)
                if m:
                    location_hint = m.group(1) if m.lastindex and m.group(1) else ""
                    return mode, location_hint.strip(), [m.group(0)]

        return "sequential", "", []


# ═══════════════════════════════════════════════════════════
# Location / Time 提取器
# ═══════════════════════════════════════════════════════════

class LocationExtractor:
    """从文本中智能提取场景位置"""

    INTERIOR = ["房间", "卧室", "客厅", "书房", "厨房", "浴室", "厅", "室", "楼", "廊", "办公室", "会议室", "教室", "审讯室", "牢房", "病房"]
    EXTERIOR = ["花园", "街道", "广场", "公园", "院", "路", "街", "河边", "海边", "山", "林", "田野", "操场"]

    @classmethod
    def extract(cls, text: str) -> Tuple[str, str]:
        """
        返回: (地点名, 时间)
        """
        # 尝试提取具体地点名
        named_loc = cls._extract_named_location(text)
        is_interior = any(w in text for w in cls.INTERIOR) or "INT." in text
        is_exterior = any(w in text for w in cls.EXTERIOR) or "EXT." in text

        location = named_loc or (f"{'室内' if is_interior else '室外' if is_exterior else '室内'}")

        return location, cls._extract_time(text)

    @classmethod
    def _extract_named_location(cls, text: str) -> Optional[str]:
        patterns = [
            r"(?:林|陈|王|李|张|赵|刘|黄|吴|周|杨|许|何|冯|孙|马|朱|胡|郭|高|罗|梁|宋|郑|谢|韩|唐|于|董|萧|程|曹|袁|邓)[家府宅园邸]",
            r"INT\.\s*(.+)",
            r"EXT\.\s*(.+)",
            r"(?:来到|走进|回到|进入)(?:了)?(.{1,8}(?:厅|室|园|房|院|楼|廊|街|场|店|馆|所))",
        ]
        for p in patterns:
            m = re.search(p, text)
            if m and m.lastindex:
                name = m.group(1).strip() if m.group(1) else m.group(0).strip()
                if name and len(name) > 1:
                    return name
        return None

    @classmethod
    def _extract_time(cls, text: str) -> str:
        if not text: return "日"
        if any(w in text for w in ["夜", "晚", "灯", "月", "星", "宵", "午夜", "凌晨"]): return "夜"
        if any(w in text for w in ["晨", "早", "日出", "天亮", "拂晓", "黎明", "清晨"]): return "晨"
        if any(w in text for w in ["黄昏", "傍晚", "日落", "暮", "夕", "入夜"]): return "昏"
        return "日"


# ═══════════════════════════════════════════════════════════
# Scene Agent
# ═══════════════════════════════════════════════════════════

class SceneAgent(BaseAgent[Dict[str, Any]]):

    @property
    def agent_name(self) -> str:
        return "scene_agent"

    @property
    def system_prompt(self) -> str:
        return "你是一位影视分场专家。根据文本识别场景边界，判断 timeline_mode，提取出场角色。"

    # ═══════════════════════════════════
    # Public API (processor 直接调用，支持进度报告)
    # ═══════════════════════════════════

    def segment_all(self, chapters: List[Dict], entity_map: Dict, story: Dict) -> List[Dict]:
        """确定性切分（公开方法，processor 分步调用）"""
        return self._segment(chapters, entity_map, story)

    async def enrich_single_scene(self, scene: Dict) -> bool:
        """润色单个场景元数据。返回 True=成功。"""
        try:
            return await self._enrich_one(scene)
        except Exception:
            return False

    # ═══════════════════════════════════
    # REAL_PATH / MOCK_PATH
    # ═══════════════════════════════════

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        chapters = state.get("chapters", [])
        scenes = self._segment(chapters, state.get("entity_map", {}), state.get("story_analysis", {}))
        if not scenes:
            return {"scenes": [], "scene_version": 0}
        try:
            for s in scenes[:3]:
                await self._enrich_one(s)
        except Exception:
            pass
        return {"scenes": scenes, "scene_version": state.get("scene_version", 1)}

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        scenes = self._segment(state.get("chapters", []), state.get("entity_map", {}), state.get("story_analysis", {}))
        return {"scenes": scenes, "scene_version": 1}

    # ═══════════════════════════════════
    # 核心分场逻辑
    # ═══════════════════════════════════

    # 场景粒度阈值
    ACCUMULATE_THRESHOLD = 30   # 低于此字数的段落无条件累积
    MIN_BEATABLE_CHARS = 120    # 低于此字数无法生成高质量节拍，继续合并
    TARGET_SCENE_MIN = 150      # 目标场景最低字数
    TARGET_SCENE_MAX = 800      # 超过此字数考虑拆分
    FORCE_SPLIT_CHARS = 3000    # 强制拆分上限

    def _segment(self, chapters: List[Dict], entity_map: Dict, story: Dict) -> List[Dict]:
        scenes = []
        scene_num = 0
        current_text = ""
        current_paragraphs: List[str] = []   # 追踪原始段落
        current_loc = ""
        current_time = "日"
        current_mode = "sequential"
        prev_loc = ""
        prev_time = ""

        def _save_scene(reason: str, markers: List[str]):
            nonlocal scene_num, current_text, current_paragraphs, current_loc, current_time, current_mode, prev_loc, prev_time
            if not current_text.strip():
                return
            scene_num += 1
            scenes.append(self._make_scene(
                scene_num, ch_idx, current_text.strip(),
                current_loc, current_time, current_mode,
                entity_map, reason, markers,
                source_paragraphs=list(current_paragraphs)
            ))
            current_text = ""
            current_paragraphs = []

        for chapter in chapters:
            raw = chapter.get("raw_text", "")
            if not raw: continue
            ch_idx = chapter.get("chapter_index", 0)

            paragraphs = self._split_paragraphs(raw)

            for para in paragraphs:
                # —— 短段落无条件累积 ——
                if len(para) < self.ACCUMULATE_THRESHOLD:
                    current_text += para + "\n"
                    current_paragraphs.append(para)
                    if not current_loc:
                        current_loc = LocationExtractor.extract(para)[0]
                        current_time = LocationExtractor.extract(para)[1]
                    continue

                # —— 检测分场类型 ——
                mode, loc_hint, markers = SceneSegmentationDetector.detect(para)
                loc, time = LocationExtractor.extract(para)

                # 强信号（叙事模式切换、章节边界）→ 无视最低字数限制直接切
                strong_signal = (mode != "sequential" and mode not in ("location_shift", "time_shift"))
                significant_location = (loc != prev_loc and prev_loc and self._significant_location_change(loc, prev_loc))
                significant_time = (time != prev_time and prev_time)

                # —— 切分判定 ——
                should_split = False
                reason = ""

                if strong_signal:
                    # 闪回/蒙太奇/平行时空 → 无条件切分
                    should_split = True
                    reason = f"叙事模式切换: {mode}"
                elif len(current_text) >= self.TARGET_SCENE_MIN and (significant_location or significant_time):
                    # 累积够目标字数 + 时空变化 → 切分
                    should_split = True
                    mode = "location_shift" if significant_location else "time_shift"
                    reason = f"地点变化: {prev_loc} → {loc}" if significant_location else f"时间变化: {prev_time} → {time}"
                elif len(current_text) > self.TARGET_SCENE_MAX and (significant_location or significant_time or len(current_text) > self.TARGET_SCENE_MAX * 1.5):
                    # 超过800字且有变化信号，或超过1200字 → 切分
                    should_split = True
                    reason = f"场景过长切分({len(current_text)}字)"
                elif len(current_text) > self.FORCE_SPLIT_CHARS:
                    # 3000字硬上限
                    should_split = True
                    reason = "强制切分(超3000字)"

                if should_split:
                    _save_scene(reason, markers)
                    current_loc = loc
                    current_time = time
                    current_mode = mode
                    prev_loc = loc
                    prev_time = time

                if not current_text:
                    current_loc = loc
                    current_time = time
                    current_mode = mode
                    prev_loc = loc
                    prev_time = time

                current_text += para + "\n"
                current_paragraphs.append(para)

            # 章末保存
            if current_text.strip():
                _save_scene("章末切分", [])

        return scenes

    def _make_scene(self, num: int, chapter: int, text: str,
                     loc: str, time: str, mode: str,
                     entity_map: Dict, reason: str, markers: List[str],
                     source_paragraphs: List[str] | None = None) -> Dict:
        """构建完整 Scene 字典，含质量评分"""
        cast = self._find_cast(text, entity_map)
        summary = text.replace("\n", " ")
        char_count = len(text)
        dialogue_hints = text.count('"') // 2 + text.count('"') // 2 + text.count('"') // 2  # 引号对数

        # 场景标题
        if mode == "location_shift":
            title = f"转场至 {loc}"
        elif mode == "time_shift":
            title = f"{loc} · {time}"
        elif mode == "flashback":
            title = f"闪回 · {loc}"
        elif mode == "montage":
            title = "蒙太奇段落"
        elif mode == "simultaneous":
            title = f"平行时空 · {loc}"
        else:
            title = loc

        # — Script Quality Score (剧本导向) —
        events = self._extract_key_events(text)
        quality = self._compute_script_quality(text, char_count, len(cast), dialogue_hints, mode, events)

        return {
            "scene_id": f"SC_{chapter + 1:03d}_{num:02d}",
            "scene_number": num,
            "episode_id": f"EP_{chapter + 1:03d}",
            "chapter_index": chapter,
            "title": title,
            "summary": summary,
            "purpose": self._infer_purpose(text),
            "location": loc,
            "time": time,
            "timeline_mode": mode,
            "conflict_level": self._estimate_conflict(text),
            "emotional_tone": self._estimate_emotion(text),
            "objective": self._infer_objective(text),
            "cast": cast,
            "raw_scene_text_block": text,
            "segmentation_reason": {
                "reason_text": reason,
                "mode": mode,
                "markers": markers,
            },
            "source_chapters": [chapter],
            "source_paragraphs": source_paragraphs or [],
            "quality": quality,
            "key_events": events,
            "beats": [],
        }

    def _extract_key_events(self, text: str) -> List[str]:
        """从文本中抽取关键叙事事件"""
        events = []
        for m in re.finditer(r'(?:回到|走进|离开|推开|关上|坐下|站起|跑[向去]|拿起|放下|转身|回头|想起|回忆|发现|看到|听见|哭泣|流泪|笑[了出]|颤抖|僵住|瘫坐|滑落|质问|争吵|对峙|推搡)', text):
            s = max(0, m.start() - 5); e = min(len(text), m.end() + 15)
            ctx = text[s:e].strip()
            if ctx and ctx not in events: events.append(ctx)
        for m in re.finditer(r'[“”「」]([^“”「」]{4,40})[“”「」]', text):
            line = m.group(1).strip()
            if line and f"对白:{line}" not in events: events.append(f"对白: {line}")
        seen = set(); unique = []
        for e in events:
            k = e[:20]
            if k not in seen: seen.add(k); unique.append(e)
        return unique[:8]

    def _compute_script_quality(self, text: str, char_count: int, char_num: int,
                                 dialogue_hints: int, mode: str, events: List[str]) -> Dict:
        """剧本导向评分: structure 25% + character 20% + conflict 20% + action 15% + dialogue 20%"""
        conflict = self._estimate_conflict(text)
        has_setup = bool(re.search(r'(?:回到|走进|来到|坐在|站在)', text))
        has_turn = bool(re.search(r'(?:突然|忽然|却[在是]|竟然|没想到|发现|得知|原来)', text))
        has_end = bool(re.search(r'(?:离开|转身|离[去开]|结束|沉默|安静|慢慢)', text))
        structure_score = 0.3 * has_setup + 0.4 * has_turn + 0.3 * has_end

        char_score = min(1.0, char_num / 3.0)
        has_confrontation = any(w in text for w in ["质问","争吵","对峙","推搡","冷战","不满","争辩","摔门"])
        conflict_score = 0.6 * conflict + 0.4 * has_confrontation

        action_verbs = len(re.findall(r'(?:站|坐|走|跑|推|拉|拿|放|转身|回头|抬[头手]|低[头下]|攥|握|颤|抖|僵|滑|落|流)', text))
        action_score = min(1.0, action_verbs / max(1, char_count / 30))

        dialogue_density = min(1.0, dialogue_hints / max(1, char_count / 60))
        subtext_hints = bool(re.search(r'(?:低声|沉默|犹豫|勉强|苦笑|叹气|不再|终究|其实)', text))
        dialogue_score = 0.6 * dialogue_density + 0.4 * subtext_hints

        total = round(0.25*structure_score + 0.20*char_score + 0.20*conflict_score + 0.15*action_score + 0.20*dialogue_score, 3)
        grade = "A" if total >= 0.8 else ("B" if total >= 0.65 else ("C" if total >= 0.5 else "D"))
        return {
            "quality_score": total, "grade": grade,
            "breakdown": {"structure":round(structure_score,2),"character_interaction":round(char_score,2),"conflict":round(conflict_score,2),"visual_action":round(action_score,2),"dialogue":round(dialogue_score,2)},
            "char_count": char_count, "character_count": char_num, "dialogue_hints": dialogue_hints,
            "event_count": len(events),
            "has_structure": {"setup":has_setup,"turn":has_turn,"end":has_end},
        }

    # ═══════════════════════════════════════
    # 辅助函数
    # ═══════════════════════════════════════

    def _split_paragraphs(self, raw: str) -> List[str]:
        paras = [p.strip() for p in raw.split("\n") if p.strip()]
        if not paras:
            # 单段长文本按句号切
            parts = re.split(r"(?<=[。！？.!?])", raw)
            paras = []
            buf = ""
            for s in parts:
                buf += s
                if len(buf) > 150:
                    paras.append(buf.strip())
                    buf = ""
            if buf.strip(): paras.append(buf.strip())
        return paras

    def _significant_location_change(self, new_loc: str, old_loc: str) -> bool:
        """判断地点变化是否显著（排除同一地点的近义词）"""
        new_clean = re.sub(r'INT\.|EXT\.|\s', '', new_loc)
        old_clean = re.sub(r'INT\.|EXT\.|\s', '', old_loc)
        return new_clean != old_clean

    def _find_cast(self, text: str, entity_map: Dict) -> List[str]:
        found = set()
        for alias, cid in entity_map.items():
            if alias in text:
                found.add(cid)
        return list(found)

    def _estimate_conflict(self, text: str) -> float:
        high = ["争吵", "冲突", "打斗", "质问", "摔门", "怒吼", "拔剑", "杀", "死", "哭喊", "逃", "拔刀", "开枪"]
        medium = ["对峙", "冷战", "矛盾", "争辩", "僵持", "不满", "推搡", "指责"]
        if any(w in text for w in high): return 0.85
        if any(w in text for w in medium): return 0.55
        return 0.25

    def _estimate_emotion(self, text: str) -> str:
        map_emo = [
            (["哭泣", "泪", "悲伤", "痛苦", "绝望", "崩溃"], "悲伤"),
            (["愤怒", "怒吼", "恨", "暴怒", "咆哮"], "愤怒"),
            (["恐惧", "害怕", "颤抖", "惊慌", "惊恐"], "恐惧"),
            (["喜悦", "高兴", "笑", "幸福", "兴奋", "欢笑"], "喜悦"),
            (["紧张", "焦虑", "不安", "担忧", "压抑"], "紧张"),
            (["温暖", "感动", "温馨", "柔情", "温柔"], "温暖"),
            (["震惊", "惊愕", "难以置信", "错愕"], "震惊"),
        ]
        for keywords, emotion in map_emo:
            if any(k in text for k in keywords): return emotion
        return "中性"

    def _infer_objective(self, text: str) -> str:
        m = re.search(r"(?:为了|想要|决定|必须|一定要)(.{2,20})[，。]", text)
        return f"为了{m.group(1)}" if m else "推进剧情发展"

    def _infer_purpose(self, text: str) -> str:
        if any(w in text for w in ["争吵", "对峙", "冲突"]): return "展现人物冲突"
        if any(w in text for w in ["想起", "回忆", "那年", "曾经"]): return "揭示角色过往"
        if any(w in text for w in ["决定", "选择", "离开", "出发"]): return "角色做出关键决定"
        if any(w in text for w in ["发现", "得知", "真相", "原来"]): return "揭示关键信息"
        return "推进叙事"

    # ═══════════════════════════════════════
    # DeepSeek 润色
    # ═══════════════════════════════════════

    async def _enrich_one(self, scene: Dict) -> bool:
        """润色单个场景元数据。返回 True=成功。"""
        text = scene.get("raw_scene_text_block", "")
        if len(text) < 50:
            return False
        client = get_deepseek_client()
        prompt = f"""分析场景文本，返回JSON: {{"summary":"场景摘要(保留原文细节,不限字数)","purpose":"戏剧目的","emotional_tone":"情绪基调"}}
文本: {text[:1500]}"""
        try:
            resp = await asyncio.wait_for(
                client.chat.completions.create(model=settings.DEEPSEEK_MODEL,
                    messages=[{"role":"user","content":prompt}],
                    temperature=0.4, max_tokens=250, timeout=12.0),
                timeout=18.0)
            content = resp.choices[0].message.content or "{}"
            content = content.strip()
            if content.startswith("```"): content = "\n".join(l for l in content.split("\n") if not l.strip().startswith("```"))
            s = content.find("{"); e = content.rfind("}") + 1
            if s >= 0 and e > s:
                d = json.loads(content[s:e])
                if d.get("summary") and len(d["summary"]) > len(scene.get("summary","")): scene["summary"] = d["summary"]
                if d.get("purpose"): scene["purpose"] = d["purpose"]
                if d.get("emotional_tone"): scene["emotional_tone"] = d["emotional_tone"]
            return True
        except Exception:
            return False
