"""
AI-NUSS 3.0 — AI Local Editing Schemas & Prompt Templates
Shared types used by the endpoint in jobs.py.
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal

# ═══════════════════════════════════════════════════════════
# Request / Response Schemas
# ═══════════════════════════════════════════════════════════

OperationType = Literal["rewrite", "expand", "shorten", "change_tone", "regenerate"]
ToneType = Literal["funny", "emotional", "dark", "romantic", "suspense", "inspirational", "professional"]

class LocalEditRequest(BaseModel):
    job_id: str = Field(..., description="Associated job ID for model config lookup")
    operation: OperationType = Field(..., description="Editing operation type")
    selected_text: str = Field(..., min_length=1, max_length=8000, description="User-selected screenplay text")
    tone: Optional[ToneType] = Field(None, description="Target tone (required for change_tone)")
    custom_instruction: Optional[str] = Field(None, max_length=500, description="User's custom editing direction")
    previous_scene: Optional[str] = Field(None, description="Previous scene context (for regenerate)")
    next_scene: Optional[str] = Field(None, description="Next scene context (for regenerate)")

class LocalEditResponse(BaseModel):
    edited_text: str = Field(..., description="AI-edited text")
    operation: OperationType
    original_length: int
    edited_length: int


# ═══════════════════════════════════════════════════════════
# Prompt Templates
# ═══════════════════════════════════════════════════════════

LANGUAGE_RULES = """
# LANGUAGE REQUIREMENTS

You are editing an existing screenplay.

The output language MUST ALWAYS be identical to the language of the selected text.

Rules:
1. Automatically detect the language of the selected text.
2. If the selected text is Chinese, the output MUST be 100% Chinese.
3. Never translate Chinese into English.
4. Never mix Chinese and English.
5. Preserve all Chinese punctuation and screenplay formatting.
6. Preserve all character names exactly as they appear.
7. Preserve all scene headings unless explicitly requested to change them.

# OUTPUT FORMAT

Return ONLY the edited screenplay text.

Do NOT output explanations.
Do NOT output markdown.
Do NOT output code blocks.
Do NOT add introductions such as:
- "Here is the rewritten version:"
- "Sure!"
- "Certainly!"
- "Here you go:"

Only output the edited screenplay text itself."""

SYSTEM_PROMPTS: dict[OperationType, str] = {
    "rewrite": f"""You are a professional screenplay editor.
Rewrite the selected screenplay text to improve clarity, naturalness, and dialogue quality.

Requirements:
- Preserve the original meaning.
- Preserve all story events.
- Preserve characters.
- Do not introduce new plot points.
{LANGUAGE_RULES}""",

    "expand": f"""You are a Hollywood screenplay writer.
Expand the selected screenplay naturally.

Requirements:
- Add richer descriptions of action and setting.
- Add better dialogue if appropriate.
- Keep screenplay format (scene headings, character names, dialogue blocks).
- Do not change the overall plot.
{LANGUAGE_RULES}""",

    "shorten": f"""You are an experienced screenplay editor.
Condense the selected screenplay.

Requirements:
- Preserve all important information and plot points.
- Remove unnecessary wording, filler, and redundancy.
- Maintain screenplay formatting.
{LANGUAGE_RULES}""",

    "change_tone": f"""You are a professional screenplay writer.
Rewrite the selected screenplay using the specified tone: {{tone}}

Requirements:
- Keep the same story events and characters.
- Only change the emotional style and atmosphere to match the requested tone.
- Adjust dialogue delivery, action descriptions, and pacing to fit the tone.
{LANGUAGE_RULES}""",

    "regenerate": f"""You are a screenplay writer.
Regenerate the selected screenplay to produce a different version.

Requirements:
- Keep the same context and surrounding story continuity.
- Produce a creatively different version — different dialogue, different action beats.
- Do not affect other scenes.
{LANGUAGE_RULES}""",
}

USER_PROMPTS: dict[OperationType, str] = {
    "rewrite": "Selected screenplay:\n\n{selected_text}\n\nRewrite it.{custom_instruction}",
    "expand": "Selected screenplay:\n\n{selected_text}\n\nExpand it.{custom_instruction}",
    "shorten": "Selected screenplay:\n\n{selected_text}\n\nShorten it.{custom_instruction}",
    "change_tone": "Selected screenplay:\n\n{selected_text}\n\nRewrite with tone: {tone}.{custom_instruction}",
    "regenerate": """Previous Scene:
{previous_scene}

Selected Scene:
{selected_text}

Next Scene:
{next_scene}

Regenerate the selected scene.{custom_instruction}""",
}
