"""
AI-NUSS 3.0 — Narrative Analyzer (叙事分析器)
抽取: premise, theme, genre, world_setting, protagonist, antagonist, main_conflict, narrative_style
这些信息影响后续 Scene/Beat/Dialogue 生成。
"""
import json
import asyncio
from typing import Dict, Any
from app.graph.agents.base import BaseAgent, get_deepseek_client
from app.core.config import settings


NARRATIVE_ANALYSIS_PROMPT = """你是一位资深剧本分析师。请分析以下小说文本，提取叙事核心要素。

## 输出格式（严格 JSON）
{
  "premise": "故事前提（一句话概括故事的核心设定和主要冲突）",
  "theme": "主题（一个词或短语，如：身份认同、复仇、成长、救赎）",
  "genre": "类型（如：都市情感、悬疑推理、科幻、武侠、历史）",
  "world_setting": "世界观设定（时间背景、社会结构、特殊规则）",
  "protagonist": "主角名字",
  "antagonist": "主要对手名字（没有则填'无'）",
  "main_conflict": "核心冲突（主角想要什么 vs 什么在阻碍）",
  "narrative_style": "叙事风格（如：线性叙事、多视角、倒叙、意识流）",
  "tone": "整体基调（如：沉重、轻松、悬疑、温暖、讽刺）"
}

## 分析要求
- premise 必须包含"谁 + 在什么情况下 + 想要什么 + 面临什么阻碍"
- theme 要精准，不要泛泛的"爱情"、"友情"
- main_conflict 要具体，不要笼统
- narrative_style 要从文本实际特征推断"""


class NarrativeAnalyzer(BaseAgent[Dict[str, Any]]):

    @property
    def agent_name(self) -> str:
        return "narrative_analyzer"

    @property
    def system_prompt(self) -> str:
        return NARRATIVE_ANALYSIS_PROMPT

    async def _run_real(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """调用 DeepSeek 分析叙事核心要素"""
        chapters = state.get("chapters", [])
        # 取前3章 + 后1章（了解开头和结局）
        text_parts = []
        for i, ch in enumerate(chapters):
            if i < 3 or i == len(chapters) - 1:
                text_parts.append(f"=== 第{ch.get('chapter_index', i+1)}章 {ch.get('title', '')} ===\n{ch.get('raw_text', '')[:2000]}")
        novel_text = "\n\n".join(text_parts)

        client = get_deepseek_client()
        try:
            resp = await asyncio.wait_for(
                client.chat.completions.create(
                    model=settings.DEEPSEEK_MODEL,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": f"请分析以下小说：\n\n{novel_text[:6000]}\n\n只返回JSON。"},
                    ],
                    temperature=0.5,
                    max_tokens=1500,
                    timeout=25.0,
                ),
                timeout=30.0,
            )
            content = resp.choices[0].message.content or "{}"
            result = self._parse_json(content)
            return {"story_analysis": result}
        except Exception:
            return {"story_analysis": self._fallback_analysis(state)}

    async def _run_mock(self, state: Dict[str, Any]) -> Dict[str, Any]:
        return {"story_analysis": self._fallback_analysis(state)}

    def _fallback_analysis(self, state: Dict) -> Dict[str, Any]:
        """从文本中做基本推断"""
        chapters = state.get("chapters", [])
        entities = state.get("entity_map", {})
        all_text = " ".join(ch.get("raw_text", "")[:500] for ch in chapters[:2])

        # 简单推断主角
        protagonist = ""
        antagonist = "无"
        chars = state.get("master_cast_list", [])
        for c in chars:
            if c.get("role") == "protagonist" and not protagonist:
                protagonist = c.get("canonical_name", "")
            if c.get("role") == "antagonist":
                antagonist = c.get("canonical_name", "")

        # 推断类型
        genre = "都市情感"
        if any(w in all_text for w in ["剑", "功法", "修炼", "仙", "魔", "江湖"]):
            genre = "武侠仙侠"
        elif any(w in all_text for w in ["星际", "飞船", "外星", "宇宙", "AI"]):
            genre = "科幻"
        elif any(w in all_text for w in ["凶手", "侦探", "案件", "死亡", "尸体"]):
            genre = "悬疑推理"
        elif any(w in all_text for w in ["皇上", "皇后", "太子", "朝廷", "将军"]):
            genre = "历史宫廷"

        return {
            "premise": f"{protagonist or '主角'}在复杂的环境中追寻自我价值，面临来自{antagonist or '外界'}的挑战",
            "theme": "成长与救赎",
            "genre": genre,
            "world_setting": "当代都市社会，家族关系为核心纽带",
            "protagonist": protagonist or "待识别",
            "antagonist": antagonist,
            "main_conflict": "个人追求与社会/家庭期望之间的冲突",
            "narrative_style": "线性叙事",
            "tone": "情感沉重",
        }

    def _parse_json(self, raw: str) -> Dict[str, Any]:
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(l for l in lines if not l.strip().startswith("```"))
        s = raw.find("{")
        e = raw.rfind("}") + 1
        if s >= 0 and e > s:
            raw = raw[s:e]
        return json.loads(raw)
