"""
AI-NUSS 3.0 — Cognitive Kernel (统一确定性纯函数单一执行内核)
Chapter 15 §1: Unified pure-function execution kernel.

CRITICAL CONTRACT:
  - NO database access, NO HTTP calls, NO LLM requests, NO LangGraph routing.
  - Purely in-memory state transformation via deterministic rules.
  - MOCK_PATH vs REAL_PATH: Hard-gated routing based on STUB_MODE.
"""
import re
import copy
import uuid
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from app.core.config import settings, DEFAULT_WEIGHTS


# ═══════════════════════════════════════════════════════════════════════
# §1: Unified Kernel Entry Point
# ═══════════════════════════════════════════════════════════════════════

def execute_narrative_kernel_loop(
    current_state: Dict[str, Any],
    config_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Unified pure-function execution kernel.
    Accepts current State memory block, runs through deterministic
    pipeline, returns transformed State.

    Module 1-7 are inlined as sub-steps of this single kernel.
    NO side effects. NO IO. Purely functional.

    PHASE P1: Full pipeline with MOCK_PATH fallback.
    PHASE P2+: REAL_PATH integrated via Agent node calls (delegated to Graph).
    """
    if config_profile is None:
        config_profile = {}

    mutated_state = copy.deepcopy(current_state)
    mock_mode = config_profile.get("MOCK_MODE", settings.STUB_MODE)

    # ---- Step 1: Document Parser (Module 1) ----
    mutated_state = _step_parse_document(mutated_state, mock_mode)

    # ---- Step 2: Story Bible Builder (Module 2) ----
    mutated_state = _step_build_story_bible(mutated_state, mock_mode)

    # ---- Step 3: Character Resolution (Module 3) ----
    mutated_state = _step_resolve_characters(mutated_state, mock_mode)

    # ---- Step 4: Scene Segmentation (Module 4) ----
    mutated_state = _step_segment_scenes(mutated_state, config_profile)

    # ---- Check: Pending Review Interrupt ----
    if mutated_state.get("review_status") in ("pending_character", "pending_scene"):
        _log_event(mutated_state, "kernel_interrupt", "Review required — halting pipeline")
        return mutated_state

    # ---- Step 5: Beat Extraction (Module 5) ----
    mutated_state = _step_extract_beats(mutated_state, mock_mode)

    # ---- Step 6: Screenplay Generation (Module 6) ----
    mutated_state = _step_generate_screenplay(mutated_state, mock_mode)

    # ---- Step 7: YAML Export (Module 7) ----
    mutated_state = _step_export_yaml(mutated_state, mock_mode)

    # ---- Finalize ----
    mutated_state["review_status"] = "completed"
    _log_event(mutated_state, "kernel_complete", "Narrative kernel loop finished successfully")

    return mutated_state


# ═══════════════════════════════════════════════════════════════════════
# §2: Deterministic Scene Score Computation
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class SceneWeights:
    """Weight matrix for scene boundary scoring."""
    L: float = 0.40   # Location change
    T: float = 0.30   # Time change
    N: float = 0.15   # Narrative mode change
    O: float = 0.10   # Objective change
    C: float = 0.05   # Conflict intensity


def compute_deterministic_scene_score(
    current_window_text: str,
    previous_window_text: str,
    weights: Optional[SceneWeights] = None,
) -> Dict[str, Any]:
    """
    Compiler-level scene break scoring kernel.
    Chapter 15 §2: Uses explicit regex feature extraction — NO LLM randomness.

    Args:
        current_window_text: The current sliding-window text chunk.
        previous_window_text: The previous window for delta comparison (unused in P0 simple mode).
        weights: Optional weight overrides.

    Returns:
        Dict with 'score' (float 0-1) and 'trace' (feature breakdown).
    """
    if weights is None:
        weights = SceneWeights(
            L=DEFAULT_WEIGHTS.L,
            T=DEFAULT_WEIGHTS.T,
            N=DEFAULT_WEIGHTS.N,
            O=DEFAULT_WEIGHTS.O,
            C=DEFAULT_WEIGHTS.C,
        )

    # === ΔL: Location change detection ===
    loc_keywords = [
        r"转移到了?", r"来到了?", r"走进了?", r"回到了?",
        r"INT\.", r"EXT\.", r"内景", r"外景",
        r"府邸", r"大厅", r"大门", r"房间", r"院[子落]",
        r"客厅", r"书房", r"花园", r"厨房", r"卧室",
        r"公司", r"办公室", r"会议室", r"走廊", r"电梯",
        r"街道", r"广场", r"公园", r"学校", r"医院",
    ]
    delta_L = 1.0 if any(re.search(pat, current_window_text) for pat in loc_keywords) else 0.0

    # === ΔT: Time change detection ===
    time_keywords = [
        r"夜深了?", r"次日", r"第二天", r"清晨", r"早晨",
        r"过了(一[会儿刻]|[几两两三]?[个]?[小]?时)",
        r"半小时", r"一小时", r"几[个]?[小]?时[之后]?",
        r"转眼间?", r"日落", r"傍晚", r"黄昏",
        r"三年[前后以]", r"几个月[前后以]", r"几天[前后以]",
        r"那年", r"那年夏天", r"那年冬天",
    ]
    delta_T = 1.0 if any(re.search(pat, current_window_text) for pat in time_keywords) else 0.0

    # === ΔN: Narrative mode change (flashback, dream, montage) ===
    narrative_keywords = [
        r"想起了?", r"回忆起?", r"回忆[中里]?",
        r"三年[前后以]", r"做了一个?梦", r"梦见",
        r"脑海里?浮现", r"镜头切换", r"画面一?转",
        r"恍惚间", r"仿佛",
    ]
    delta_N = 1.0 if any(re.search(pat, current_window_text) for pat in narrative_keywords) else 0.0

    # === ΔO: Objective / dramatic goal change (heuristic) ===
    # Detected via paragraph breaks, explicit goal statements
    objective_keywords = [
        r"决定[要了]", r"下定决[心定]", r"必须[要去]",
        r"目的[是地]", r"目标[是]", r"计划",
    ]
    delta_O = 1.0 if any(re.search(pat, current_window_text) for pat in objective_keywords) else 0.5

    # === ΔC: Conflict intensity (constant baseline) ===
    conflict_keywords = [
        r"争吵", r"冲突", r"打[斗架]", r"质问",
        r"冷战", r"对峙", r"矛盾", r"爆发",
    ]
    delta_C = 1.0 if any(re.search(pat, current_window_text) for pat in conflict_keywords) else 0.2

    # === Weighted Sum ===
    computed_score = (
        (weights.L * delta_L)
        + (weights.T * delta_T)
        + (weights.N * delta_N)
        + (weights.O * delta_O)
        + (weights.C * delta_C)
    )

    # Clamp to [0, 1]
    computed_score = max(0.0, min(1.0, computed_score))

    return {
        "score": round(computed_score, 3),
        "trace": {
            "delta_L": delta_L,
            "delta_T": delta_T,
            "delta_N": delta_N,
            "delta_O": delta_O,
            "delta_C": delta_C,
            "score_computed": round(computed_score, 3),
        },
        "verdict": "scene_break" if computed_score >= settings.SCENE_SCORE_THRESHOLD else "continue",
    }


# ═══════════════════════════════════════════════════════════════════════
# Internal Pipeline Steps (Module 1-7 inlined)
# ═══════════════════════════════════════════════════════════════════════

def _step_parse_document(state: Dict[str, Any], mock_mode: bool) -> Dict[str, Any]:
    """Module 1: Document Parser — pure Python rule-based parsing."""
    _log_event(state, "parse_start", "Document parsing started")

    if mock_mode:
        # MOCK_PATH: Use stub chapter data
        state["chapters"] = state.get("chapters") or [
            {
                "chapter_index": 1,
                "title": "第一章 命运的钥匙",
                "raw_text": (
                    "夜深了，林府正厅灯火通明。林雨欣独自站在红木桌旁，"
                    "指尖微微颤抖。三年前，她以林家千金的身份踏入这座宅邸，"
                    "如今却像一个等待审判的囚徒。门外传来高跟鞋敲击地板的"
                    "清脆响声，林母冷笑着走了进来，手里攥着一份文件。"
                    "“拿着它，立刻滚出林家。”林母将那份血液亲子鉴定报告"
                    "甩在桌上。林雨欣面色瞬间惨白，世界在眼前轰然崩塌。"
                ),
            },
            {
                "chapter_index": 2,
                "title": "第二章 破碎的真相",
                "raw_text": (
                    "次日清晨，林雨欣独自坐在花园的长椅上。阳光透过梧桐叶"
                    "洒下斑驳的光影，她想起了第一次来到林家时的情景——"
                    "那时的她满怀希望，以为终于找到了真正的家。"
                    "“为什么偏偏是我？”她低声自语，眼泪终于夺眶而出。老王远远地"
                    "站在回廊下，叹了口气，转身离去。"
                ),
            },
        ]
        state["current_chapter_index"] = 0
    else:
        # TODO (PHASE P2+): REAL_PATH — use LLM for chapter splitting
        pass

    _log_event(state, "parse_complete", f"Parsed {len(state.get('chapters', []))} chapters")
    state["review_status"] = "analyzing"
    return state


def _step_build_story_bible(state: Dict[str, Any], mock_mode: bool) -> Dict[str, Any]:
    """Module 2: Story Bible Builder."""
    _log_event(state, "bible_start", "Story Bible construction started")

    if mock_mode:
        state["story_bible"] = state.get("story_bible") or {
            "world_setting": (
                "现代都市背景。林府是当地有影响力的豪门家族，"
                "家族内部等级森严，血缘被视为至高无上的纽带。"
            ),
            "organizations": [
                {"org_id": "ORG_001", "name": "林府", "description": "当地第一豪门，掌控多家企业"},
            ],
            "global_rules": [
                {"rule_id": "R_001", "description": "真假千金身份血缘对立，不可共存"},
                {"rule_id": "R_002", "description": "家族名誉高于个人情感"},
            ],
        }
        state["story_bible_version"] = 1
    else:
        # TODO (PHASE P2+): REAL_PATH — Claude 3.5 Sonnet for bible extraction
        state["story_bible"] = _stub_bible_from_text(state)
        state["story_bible_version"] = 1

    _log_event(state, "bible_complete", f"Bible v{state['story_bible_version']} built")
    return state


def _step_resolve_characters(state: Dict[str, Any], mock_mode: bool) -> Dict[str, Any]:
    """Module 3: Character Resolver with alias disambiguation."""
    _log_event(state, "character_start", "Character resolution started")

    if mock_mode:
        state["entity_map"] = state.get("entity_map") or {
            "雨欣": "CH_LIN",
            "林雨欣": "CH_LIN",
            "林姑娘": "CH_LIN",
            "大小姐": "CH_LIN",
            "林母": "CH_MOTHER",
            "林夫人": "CH_MOTHER",
            "母亲": "CH_MOTHER",
            "老王": "CH_WANG",
            "王局长": "CH_WANG",
        }
        state["master_cast_list"] = state.get("master_cast_list") or [
            {
                "character_id": "CH_LIN",
                "canonical_name": "林雨欣",
                "aliases": ["雨欣", "林姑娘", "大小姐"],
                "constraints": {
                    "current_belief": "隐忍顺从才能换来家庭的爱",
                    "current_goal": "极力讨好林母，留在林家",
                    "emotional_state": "压抑自卑",
                    "internal_conflict": "自尊反抗 vs 依赖家庭",
                    "taboos": ["怕狗", "不能吃花生"],
                },
                "description": "20岁出头的年轻女子，容貌秀丽但眼神忧郁",
                "role": "protagonist",
                "confidence_score": 0.95,
            },
            {
                "character_id": "CH_MOTHER",
                "canonical_name": "林母",
                "aliases": ["林夫人", "母亲"],
                "constraints": {
                    "current_belief": "血缘高于一切",
                    "current_goal": "赶走假千金，维护家族颜面",
                    "emotional_state": "愤怒而冷酷",
                    "internal_conflict": "母爱残留 vs 家族利益",
                    "taboos": [],
                },
                "description": "50岁左右的贵妇人，保养得当但眼神锐利",
                "role": "antagonist",
                "confidence_score": 0.92,
            },
            {
                "character_id": "CH_WANG",
                "canonical_name": "老王",
                "aliases": ["王局长", "王管家"],
                "constraints": {
                    "current_belief": "忠诚于林家，但同情雨欣",
                    "current_goal": "维持林家秩序",
                    "emotional_state": "矛盾的同情",
                    "internal_conflict": "职责 vs 良知",
                    "taboos": [],
                },
                "description": "60岁左右的林家老管家，沉默寡言",
                "role": "supporting",
                "confidence_score": 0.88,
            },
        ]
        state["entity_map_version"] = 1
    else:
        # TODO (PHASE P2+): REAL_PATH — Gemini 1.5 Flash for NER + entity resolution
        state["entity_map"] = _stub_entity_map_from_chapters(state)
        state["entity_map_version"] = 1

    _log_event(state, "character_complete", f"Resolved {len(state.get('master_cast_list', []))} characters")
    return state


def _step_segment_scenes(
    state: Dict[str, Any], config_profile: Dict[str, Any]
) -> Dict[str, Any]:
    """Module 4: Scene Segmentation Engine using deterministic scoring."""
    _log_event(state, "scene_start", "Scene segmentation started")

    chapters = state.get("chapters", [])
    if not chapters:
        state["scenes"] = []
        state["review_status"] = "pending_scene"
        return state

    weights = SceneWeights(
        L=config_profile.get("scene_weight_L", DEFAULT_WEIGHTS.L),
        T=config_profile.get("scene_weight_T", DEFAULT_WEIGHTS.T),
        N=config_profile.get("scene_weight_N", DEFAULT_WEIGHTS.N),
        O=config_profile.get("scene_weight_O", DEFAULT_WEIGHTS.O),
        C=config_profile.get("scene_weight_C", DEFAULT_WEIGHTS.C),
    )

    scenes = []
    scene_number = 0
    current_chapter_idx = state.get("current_chapter_index", 0)

    for chapter in chapters:
        raw_text = chapter.get("raw_text", "")
        if not raw_text:
            continue

        # Simple sliding-window segmentation: split on paragraph boundaries
        paragraphs = [p.strip() for p in raw_text.split("\n") if p.strip()]
        if not paragraphs:
            paragraphs = [_split_long_text(raw_text)]

        for para in paragraphs:
            if len(para) < 20:  # Skip very short paragraphs
                continue

            scene_number += 1
            score_result = compute_deterministic_scene_score(para, "", weights)

            # Detect timeline mode
            timeline_mode = _detect_timeline_mode(para)

            # Detect location
            location = _extract_location(para)

            # Detect time of day
            time_of_day = _extract_time_of_day(para)

            # Detect POV character
            pov_id = _extract_pov_character(para, state.get("entity_map", {}))

            scenes.append({
                "scene_id": f"SC_{current_chapter_idx + 1:03d}_{scene_number:02d}",
                "scene_number": scene_number,
                "chapter_index": chapter.get("chapter_index", current_chapter_idx),
                "metadata": {
                    "location": location,
                    "time_of_day": time_of_day,
                    "timeline_mode": timeline_mode,
                    "pov_character_id": pov_id,
                },
                "explainable_trace": score_result["trace"],
                "raw_scene_text_block": para,
                "summary": para[:120] + ("..." if len(para) > 120 else ""),
                "timeline_mode": timeline_mode,
                "character_ids": _extract_character_ids_in_scene(para, state.get("entity_map", {})),
                "scene_score": score_result["score"],
                "beats": [],  # Filled in Step 5
            })

    state["scenes"] = scenes
    state["scene_version"] = 1
    state["current_chapter_index"] = current_chapter_idx + len(chapters)

    _log_event(state, "scene_complete", f"Segmented {len(scenes)} scenes")
    return state


def _step_extract_beats(state: Dict[str, Any], mock_mode: bool) -> Dict[str, Any]:
    """Module 5: Beat Extractor — causality chain linking."""
    _log_event(state, "beat_start", "Beat extraction started")

    if mock_mode:
        state["beats"] = _generate_mock_beats(state.get("scenes", []))
    else:
        # TODO (PHASE P2+): REAL_PATH — Claude 3.5 Sonnet for beat extraction
        state["beats"] = _generate_mock_beats(state.get("scenes", []))

    # Attach beats to their parent scenes
    beats_by_scene: Dict[str, List[Dict]] = {}
    for beat in state["beats"]:
        sid = beat.get("scene_id", "")
        beats_by_scene.setdefault(sid, []).append(beat)

    for scene in state.get("scenes", []):
        scene["beats"] = beats_by_scene.get(scene["scene_id"], [])

    _log_event(state, "beat_complete", f"Extracted {len(state.get('beats', []))} beats")
    return state


def _step_generate_screenplay(state: Dict[str, Any], mock_mode: bool) -> Dict[str, Any]:
    """Module 6: Screenplay & Cinematic Layer Generator."""
    _log_event(state, "screenplay_start", "Screenplay generation started")

    if mock_mode:
        state["screenplay"] = _generate_mock_screenplay(state)
    else:
        # TODO (PHASE P2+): REAL_PATH — Claude 3.5 Sonnet for visual elements
        state["screenplay"] = _generate_mock_screenplay(state)

    _log_event(state, "screenplay_complete", "Screenplay generated")
    return state


def _step_export_yaml(state: Dict[str, Any], mock_mode: bool) -> Dict[str, Any]:
    """Module 7: YAML Exporter — structured output."""
    _log_event(state, "export_start", "YAML export started")
    # YAML serialization is handled by the Pydantic validators in schemas/
    # This step marks the state as completed
    _log_event(state, "export_complete", "YAML export ready")
    return state


# ═══════════════════════════════════════════════════════════════════════
# Heuristic Helper Functions (Pure Python Feature Extractors)
# ═══════════════════════════════════════════════════════════════════════

def _detect_timeline_mode(text: str) -> str:
    """Detect timeline mode from text features."""
    flashback_markers = [r"想起了?", r"回忆起?", r"三年[前后以]", r"那年", r"梦见", r"脑海里?浮现"]
    montage_markers = [r"镜头切换", r"画面.*转", r"转眼间"]
    parallel_markers = [r"与此[同时同]", r"另一[边面]"]

    if any(re.search(m, text) for m in flashback_markers):
        return "flashback"
    if any(re.search(m, text) for m in montage_markers):
        return "montage"
    if any(re.search(m, text) for m in parallel_markers):
        return "parallel"
    return "sequential"


def _extract_location(text: str) -> str:
    """Extract likely location from text."""
    loc_patterns = [
        (r"INT\.\s*(\S+)", "INT. {}"),
        (r"EXT\.\s*(\S+)", "EXT. {}"),
        (r"(?:走进|来到|回到)(?:了)?(\S{1,8}(?:厅|室|园|房|院|楼|廊|街|场))", "INT. {}"),
        (r"(\S{1,6}[厅室园房院楼廊街场])[，。,\.\s]", "{}"),
    ]
    for pattern, template in loc_patterns:
        m = re.search(pattern, text)
        if m:
            loc = m.group(1) if m.lastindex else m.group(0)
            return template.format(loc.strip())

    # Default: guess from context
    if any(w in text for w in ["房间", "卧室", "客厅", "书房", "厨房"]):
        return "INT. 室内"
    if any(w in text for w in ["花园", "街道", "广场", "公园", "院"]):
        return "EXT. 室外"
    return "INT. 未知场景"


def _extract_time_of_day(text: str) -> str:
    """Extract time of day from text."""
    night = [r"夜深", r"夜晚", r"晚上", r"黑夜", r"灯[火光]"]
    morning = [r"清晨", r"早晨", r"早上", r"日出", r"天亮"]
    afternoon = [r"下午", r"午后", r"傍晚", r"黄昏", r"日落"]
    day = [r"白天", r"阳光", r"日"]

    if any(re.search(m, text) for m in night):
        return "夜"
    if any(re.search(m, text) for m in morning):
        return "晨"
    if any(re.search(m, text) for m in afternoon):
        return "暮"
    if any(re.search(m, text) for m in day):
        return "日"
    return "日"  # Default


def _extract_pov_character(text: str, entity_map: Dict[str, str]) -> Optional[str]:
    """Extract likely POV character from text."""
    for alias, char_id in entity_map.items():
        if alias in text[:50]:  # Check first 50 chars
            return char_id
    return None


def _extract_character_ids_in_scene(text: str, entity_map: Dict[str, str]) -> List[str]:
    """Find all character IDs mentioned in scene text."""
    found = set()
    for alias, char_id in entity_map.items():
        if alias in text:
            found.add(char_id)
    return list(found)


def _split_long_text(text: str, max_len: int = 500) -> str:
    """Split long text into paragraphs at sentence boundaries."""
    sentences = re.split(r"(?<=[。！？.!?])", text)
    result = ""
    current = ""
    for s in sentences:
        if len(current) + len(s) > max_len:
            result += current + "\n"
            current = s
        else:
            current += s
    if current:
        result += current
    return result if result else text


# ═══════════════════════════════════════════════════════════════════════
# Stub / Fallback Generators
# ═══════════════════════════════════════════════════════════════════════

def _stub_bible_from_text(state: Dict[str, Any]) -> Dict[str, Any]:
    """Generate stub story bible from first 200 chars of novel text."""
    text = ""
    for ch in state.get("chapters", []):
        text += ch.get("raw_text", "")[:200]
        break
    return {
        "world_setting": f"故事世界背景（从文本提取）: {text[:100]}...",
        "organizations": [],
        "global_rules": [],
    }


def _stub_entity_map_from_chapters(state: Dict[str, Any]) -> Dict[str, str]:
    """Stub entity map — extract capitalized Chinese names via regex."""
    name_pattern = re.compile(r"([林王张李陈赵刘黄吴周杨许何冯孙马朱胡郭高罗梁宋郑谢韩唐于董萧程曹袁邓])")
    entity_map: Dict[str, str] = {}
    for ch in state.get("chapters", []):
        for match in name_pattern.finditer(ch.get("raw_text", "")):
            # Simple stub: single-char surnames mapped to CH_UNKNOWN_X
            surname = match.group(1)
            if surname not in entity_map:
                entity_map[surname] = f"CH_UNKNOWN_{len(entity_map):03d}"
    return entity_map


def _generate_mock_beats(scenes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate mock causality-chain beats for each scene."""
    beat_templates = [
        {"beat_type": "setup", "dramatic_function": "建立当前场景的基本情境与角色状态"},
        {"beat_type": "reveal", "dramatic_function": "打破表面平静，引入关键信息或冲突事件"},
        {"beat_type": "conflict", "dramatic_function": "角色直面冲突，情绪与立场产生碰撞"},
        {"beat_type": "decision", "dramatic_function": "角色基于冲突做出关键选择"},
        {"beat_type": "resolution", "dramatic_function": "场景冲突暂时化解或进入新的平衡"},
    ]

    beats = []
    for scene in scenes:
        scene_text = scene.get("raw_scene_text_block", "")
        scene_id = scene.get("scene_id", "SC_UNKNOWN")
        for i, tmpl in enumerate(beat_templates[:3]):  # 3 beats per scene in stub mode
            beat_id = f"B_{uuid.uuid4().hex[:6].upper()}"
            beats.append({
                "beat_id": beat_id,
                "scene_id": scene_id,
                "beat_number": i + 1,
                "beat_type": tmpl["beat_type"],
                "dramatic_function": tmpl["dramatic_function"],
                "causality_chain": {
                    "trigger": f"场景{scene['scene_number']}节拍{i+1}触发事件",
                    "action": f"角色对触发事件的行动反应",
                    "consequence": f"该行动带来的戏剧后果",
                },
                "summary": scene_text[:80] + ("..." if len(scene_text) > 80 else ""),
                "raw_text_snippet": scene_text[:200],
                "elements": [],
                "emotional_tone": ["紧张", "震惊", "释然", "悲伤", "愤怒"][i % 5],
                "intensity": round(0.5 + i * 0.15, 2),
                "confidence_score": 0.85,
            })
    return beats


def _generate_mock_screenplay(state: Dict[str, Any]) -> Dict[str, Any]:
    """Generate mock screenplay elements for all beats."""
    screenplay = {"scenes": []}
    cast = {c["character_id"]: c for c in state.get("master_cast_list", [])}

    for scene in state.get("scenes", []):
        scene_screenplay = {
            "scene_id": scene["scene_id"],
            "scene_heading": f"{scene.get('metadata', {}).get('location', 'INT. 未知')} — {scene.get('metadata', {}).get('time_of_day', '日')}",
            "timeline_mode": scene.get("timeline_mode", "sequential"),
            "beats": [],
        }

        for beat in scene.get("beats", []):
            char_ids = scene.get("character_ids", [])
            elements = _generate_mock_elements(beat, char_ids)
            beat_screenplay = {
                "beat_id": beat["beat_id"],
                "beat_type": beat["beat_type"],
                "dramatic_function": beat["dramatic_function"],
                "elements": elements,
            }
            scene_screenplay["beats"].append(beat_screenplay)

        screenplay["scenes"].append(scene_screenplay)

    return screenplay


def _generate_mock_elements(beat: Dict[str, Any], char_ids: List[str]) -> List[Dict[str, Any]]:
    """Generate mock cinematic elements for a single beat."""
    elements = []
    beat_type = beat.get("beat_type", "setup")

    # Action element
    if char_ids:
        elements.append({
            "type": "action",
            "character_id": char_ids[0],
            "content": f"[{beat_type}] 角色在场景中做出关键动作，推动戏剧向前发展。",
            "cinematic_layer": {
                "camera": {"shot": "medium", "movement": "static"},
                "lighting": "自然光",
                "sound": "环境音",
            },
        })

    # Dialogue element (if multiple characters)
    if len(char_ids) >= 2:
        elements.append({
            "type": "dialogue",
            "character_id": char_ids[1] if len(char_ids) > 1 else char_ids[0],
            "target_character_id": char_ids[0],
            "emotion": "严肃",
            "intention": "揭示真相",
            "content": f"[{beat_type}] 角色之间的关键对话内容。",
            "is_voice_over": False,
        })

    return elements


# ═══════════════════════════════════════════════════════════════════════
# Utility
# ═══════════════════════════════════════════════════════════════════════

def _log_event(state: Dict[str, Any], event: str, message: str) -> None:
    """Append an atomic event to the state's event_log."""
    from datetime import datetime, timezone
    log = state.setdefault("event_log", [])
    log.append({
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "event": event,
        "message": message,
    })
