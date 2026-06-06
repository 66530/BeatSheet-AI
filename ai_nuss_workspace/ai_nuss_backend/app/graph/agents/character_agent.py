"""
AI-NUSS 3.0 — Character Agent (Role Resolution & Constraint Builder)
REAL_PATH: DeepSeek API for NER + entity resolution + constraint extraction.
MOCK_PATH: Regex-based stub.
"""
import json
import re
from typing import Dict, Any
from app.core.config import settings
from app.graph.agents.base import BaseAgent
from app.prompts.loader import load_prompt


class CharacterAgent(BaseAgent[Dict[str, Any]]):

    @property
    def agent_name(self) -> str:
        return "character_agent"

    @property
    def system_prompt(self) -> str:
        return load_prompt("character_agent")

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Call DeepSeek for character extraction and alias resolution."""
        chapters = state.get("chapters", [])
        novel_text = "\n\n".join(
            f"=== 第{ch.get('chapter_index', '?')}章 ===\n{ch.get('raw_text', '')}"
            for ch in chapters[:3]
        )

        story_bible = state.get("story_bible", {})
        bible_text = json.dumps(story_bible, ensure_ascii=False, indent=2)

        user_msg = f"""请分析以下小说文本，识别所有角色并构建角色档案。

## 故事圣经
{bible_text}

## 小说文本
{novel_text}

请严格按照 JSON schema 输出，只返回 JSON，不要包含其他文字。"""

        result = await self._call_deepseek_json(user_msg)

        # Check confidence threshold
        master_cast = result.get("master_cast_list", [])
        requires_review = any(
            c.get("confidence_score", 1.0) < settings.CHARACTER_CONFIDENCE_THRESHOLD
            for c in master_cast
        )

        return {
            "entity_map": result.get("entity_map", {}),
            "entity_map_version": state.get("entity_map_version", 1),
            "master_cast_list": master_cast,
            "requires_review": requires_review,
        }

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        entity_map = state.get("entity_map", {})
        master_cast = state.get("master_cast_list", [])

        if entity_map and master_cast:
            return {
                "entity_map": entity_map,
                "entity_map_version": state.get("entity_map_version", 1),
                "master_cast_list": master_cast,
            }

        chapters = state.get("chapters", [])
        all_text = " ".join(ch.get("raw_text", "") for ch in chapters[:2])

        surnames = set(re.findall(r"[林王张李陈赵刘黄吴周杨许何冯孙马朱胡郭高罗]", all_text))
        stub_cast = []
        stub_map = {}

        for i, surname in enumerate(list(surnames)[:5]):
            char_id = f"CH_{surname.upper()}{i:03d}"
            stub_map[surname] = char_id
            stub_cast.append({
                "character_id": char_id,
                "canonical_name": f"{surname}某",
                "aliases": [surname],
                "constraints": {
                    "current_belief": "待解析",
                    "current_goal": "待解析",
                    "emotional_state": "待解析",
                    "internal_conflict": "待解析",
                    "taboos": [],
                },
                "description": f"从文本中检测到的角色（姓氏：{surname}）",
                "role": "supporting",
                "confidence_score": 0.5,
            })

        return {
            "entity_map": stub_map,
            "entity_map_version": state.get("entity_map_version", 1),
            "master_cast_list": stub_cast,
            "requires_review": len(stub_cast) > 0,
        }
