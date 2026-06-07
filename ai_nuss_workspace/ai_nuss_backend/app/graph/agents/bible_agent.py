"""
AI-NUSS 3.0 — Bible Agent (Story Bible Builder)
REAL_PATH: DeepSeek API via OpenAI SDK.
MOCK_PATH: Stub story bible.
"""
from typing import Dict, Any
from app.graph.agents.base import BaseAgent
from app.prompts.loader import load_prompt


class BibleAgent(BaseAgent[Dict[str, Any]]):

    @property
    def agent_name(self) -> str:
        return "bible_agent"

    @property
    def system_prompt(self) -> str:
        return load_prompt("bible_agent")

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Call DeepSeek to extract world setting, organizations, rules."""
        chapters = state.get("chapters", [])
        novel_text = "\n\n".join(
            f"=== 第{ch.get('chapter_index', '?')}章 {ch.get('title', '')} ===\n{ch.get('raw_text', '')}"
            for ch in chapters[:3]  # First 3 chapters
        )

        user_msg = f"""请分析以下小说文本，提取故事世界观、组织势力和全局规则。

{novel_text}

请严格按照 JSON schema 输出，只返回 JSON，不要包含其他文字。"""

        result = await self._call_llm_json(state, user_msg)
        return {
            "story_bible": result.get("story_bible", {}),
            "story_bible_version": state.get("story_bible_version", 1),
        }

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        if state.get("story_bible"):
            return {
                "story_bible": state["story_bible"],
                "story_bible_version": state.get("story_bible_version", 1),
            }

        chapters = state.get("chapters", [])
        first_text = chapters[0].get("raw_text", "")[:200] if chapters else ""

        return {
            "story_bible": {
                "world_setting": f"现代都市背景。{first_text[:100]}..." if first_text else "待解析",
                "organizations": [
                    {"org_id": "ORG_001", "name": "主要组织", "description": "从文本提取"}
                ],
                "global_rules": [
                    {"rule_id": "R_001", "description": "核心冲突规则"}
                ],
            },
            "story_bible_version": 1,
        }
