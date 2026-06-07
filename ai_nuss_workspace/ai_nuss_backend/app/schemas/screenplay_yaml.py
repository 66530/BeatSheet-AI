"""
AI-NUSS 3.0 — Screenplay YAML Schema Definition
Represents the final structured screenplay output format.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class CinematicLayer(BaseModel):
    """Camera, lighting, and sound direction for a single element."""
    camera: Optional[Dict[str, str]] = Field(None, description="{shot: close_up, movement: tilt_up}")
    lighting: Optional[str] = Field(None, description="Lighting description, e.g. 冷色调强反差顶光")
    sound: Optional[str] = Field(None, description="Sound direction, e.g. 突发低频心跳特效声")


class ScreenplayElement(BaseModel):
    """A single atomic audio-visual element in the screenplay."""
    type: str = Field(..., description="action|dialogue|inner_monologue|caption")
    character_id: Optional[str] = None
    target_character_id: Optional[str] = None
    content: str
    emotion: Optional[str] = None
    intention: Optional[str] = None
    is_voice_over: bool = False
    cinematic_layer: Optional[CinematicLayer] = None


class ScreenplayBeatYAML(BaseModel):
    """One beat rendered as screenplay elements."""
    beat_id: str
    beat_type: str
    dramatic_function: Optional[str] = None
    elements: List[ScreenplayElement] = Field(default_factory=list)


class DirectorNote(BaseModel):
    """AI导演助手 — 单场景影视化导演建议。"""
    emotion: str = Field("neutral", description="suspense|tense|sad|romantic|warm|action|hopeful|mysterious")
    visual_style: str = Field("realism", description="crime_drama|suspense_thriller|realism|romantic_drama|sci_fi|historical|action|fantasy")
    camera_plan: List[Dict[str, str]] = Field(default_factory=list, description="3~5 个镜头计划")
    lighting: str = Field("自然光", description="打光建议")
    music: str = Field("环境氛围音", description="配乐建议")
    pacing: str = Field("medium", description="slow|medium|fast")
    director_comment: str = Field("", description="导演备注，不超过50字")


class ScreenplaySceneYAML(BaseModel):
    """One scene rendered as a sequence of beats."""
    scene_id: str
    scene_number: int
    scene_heading: str = Field("", description="e.g. 林府正厅 — 夜")
    timeline_mode: str = "sequential"
    beats: List[ScreenplayBeatYAML] = Field(default_factory=list)
    director_note: Optional[DirectorNote] = Field(None, description="AI导演助手分析结果")


class ScreenplayDocument(BaseModel):
    """Top-level screenplay YAML document."""
    novel_id: str
    novel_title: str
    screenplay_version: int = 1
    generated_at: str = ""
    scenes: List[ScreenplaySceneYAML] = Field(default_factory=list)
    master_cast: List[Dict[str, Any]] = Field(default_factory=list)
