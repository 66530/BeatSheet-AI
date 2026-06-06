"""
AI-NUSS 3.0 — Narrative Data Models
完整叙事层级: Story → Episode → Scene → Beat → ScreenplayElement
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════
# Screenplay Elements (底层)
# ═══════════════════════════════════════════════════════

class ActionElement(BaseModel):
    """可拍摄动作 — Show, Not Tell"""
    type: str = "action"
    description: str = Field(..., description="可拍摄的动作描述")
    character_id: Optional[str] = None
    cinematic_hint: Optional[Dict[str, str]] = Field(None, description="镜头建议: {shot, movement}")


class DialogueElement(BaseModel):
    """戏剧驱动对白"""
    type: str = "dialogue"
    speaker_id: str
    target_id: Optional[str] = None
    line: str = Field(..., description="对白内容")
    subtext: Optional[str] = Field(None, description="潜台词")
    emotion: Optional[str] = None
    intention: Optional[str] = Field(None, description="说话目的")
    is_voice_over: bool = False


class VoiceOverElement(BaseModel):
    """画外音"""
    type: str = "voice_over"
    character_id: str
    content: str


class InnerMonologueElement(BaseModel):
    """内心独白"""
    type: str = "inner_monologue"
    character_id: str
    content: str
    trigger: Optional[str] = Field(None, description="触发内心活动的外部刺激")


class CaptionElement(BaseModel):
    """字幕/叠加文字"""
    type: str = "caption"
    content: str
    style: Optional[str] = Field("white_text", description="字幕样式")


class FlashbackElement(BaseModel):
    """闪回段落"""
    type: str = "flashback"
    trigger: str = Field(..., description="触发闪回的媒介")
    content: str = Field(..., description="闪回内容")
    duration_hint: Optional[str] = Field("brief", description="时长提示: brief/medium/extended")


class CinematicLayer(BaseModel):
    """视听层"""
    camera: Optional[Dict[str, str]] = Field(None, description="{shot, movement, angle}")
    lighting: Optional[str] = None
    sound: Optional[str] = None
    color_palette: Optional[str] = None


# ═══════════════════════════════════════════════════════
# Beat (节拍)
# ═══════════════════════════════════════════════════════

class BeatModel(BaseModel):
    """戏剧节拍 — Scene 的子层"""
    beat_id: str
    beat_number: int
    beat_type: str = Field(..., description="setup|reveal|conflict|decision|twist|climax|resolution")
    summary: str
    objective: Optional[str] = Field(None, description="节拍戏剧目的")
    conflict: Optional[str] = Field(None, description="冲突内容")
    emotion: Optional[str] = Field(None, description="主导情绪")
    intensity: float = Field(0.5, ge=0.0, le=1.0, description="戏剧烈度")
    cast: List[str] = Field(default_factory=list, description="出场角色 ID 列表")

    # 剧本元素
    actions: List[ActionElement] = Field(default_factory=list)
    dialogues: List[DialogueElement] = Field(default_factory=list)
    voice_overs: List[VoiceOverElement] = Field(default_factory=list)
    inner_monologues: List[InnerMonologueElement] = Field(default_factory=list)
    captions: List[CaptionElement] = Field(default_factory=list)
    flashbacks: List[FlashbackElement] = Field(default_factory=list)

    # 溯源
    source_paragraphs: List[str] = Field(default_factory=list, description="原文段落引用")
    cinematic_layer: Optional[CinematicLayer] = None


# ═══════════════════════════════════════════════════════
# Scene (场次)
# ═══════════════════════════════════════════════════════

class SegmentationReason(BaseModel):
    """可解释切场原因"""
    location_changed: bool = False
    time_changed: bool = False
    objective_changed: bool = False
    conflict_changed: bool = False
    narrative_mode_changed: bool = False
    score: float = 0.0
    reason_text: str = ""


class SceneModel(BaseModel):
    """场次"""
    scene_id: str
    scene_number: int
    episode_id: Optional[str] = None
    chapter_index: Optional[int] = None

    # 元数据
    title: str = ""
    summary: str = ""
    purpose: Optional[str] = Field(None, description="场景戏剧目的")
    location: str = "INT. 未知场景"
    time: str = "日"
    timeline_mode: str = Field("sequential", description="sequential|flashback|dream|parallel|montage")
    conflict_level: float = Field(0.5, ge=0.0, le=1.0, description="冲突等级")
    emotional_tone: str = "中性"
    objective: Optional[str] = Field(None, description="当前场景目标")

    # 角色
    cast: List[str] = Field(default_factory=list, description="出场角色 ID")

    # 切场原因
    segmentation_reason: SegmentationReason = Field(default_factory=SegmentationReason)

    # 内容
    raw_scene_text_block: str = ""
    beats: List[BeatModel] = Field(default_factory=list)

    # 溯源
    source_chapters: List[int] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════
# Episode (集/章)
# ═══════════════════════════════════════════════════════

class EpisodeModel(BaseModel):
    """叙事单元"""
    episode_id: str
    episode_number: int
    title: str = ""
    summary: str = ""
    scenes: List[SceneModel] = Field(default_factory=list)
    source_chapters: List[int] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════
# Story (故事宏观分析)
# ═══════════════════════════════════════════════════════

class StoryAnalysis(BaseModel):
    """叙事分析结果"""
    premise: str = Field("", description="故事前提")
    theme: str = Field("", description="主题")
    genre: str = Field("", description="类型")
    world_setting: str = Field("", description="世界观设定")
    protagonist: str = Field("", description="主角")
    antagonist: str = Field("", description="对手")
    main_conflict: str = Field("", description="核心冲突")
    narrative_style: str = Field("", description="叙事风格")
    tone: str = Field("", description="整体基调")


class CharacterConstraint(BaseModel):
    """角色约束"""
    current_belief: str = ""
    current_goal: str = ""
    emotional_state: str = ""
    internal_conflict: str = ""
    taboos: List[str] = Field(default_factory=list)
    voice_style: str = Field("", description="说话风格")


class CharacterModel(BaseModel):
    """角色"""
    character_id: str
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    role: str = "supporting"
    archetype: str = ""
    constraints: CharacterConstraint = Field(default_factory=CharacterConstraint)
    description: str = ""
    confidence_score: float = 1.0


# ═══════════════════════════════════════════════════════
# Full Screenplay Document
# ═══════════════════════════════════════════════════════

class ScreenplayDocument(BaseModel):
    """完整剧本文档"""
    novel_id: str
    novel_title: str
    generated_at: str = ""

    story_analysis: StoryAnalysis = Field(default_factory=StoryAnalysis)
    character_graph: List[CharacterModel] = Field(default_factory=list)
    entity_map: Dict[str, str] = Field(default_factory=dict)
    episodes: List[EpisodeModel] = Field(default_factory=list)
    global_rules: List[Dict[str, str]] = Field(default_factory=list)
