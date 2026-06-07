"""
AI-NUSS 3.0 — Unified BaseAgent with Model Configuration Support
REAL_PATH: Calls user-configured LLM via OpenAI-compatible API.
MOCK_PATH: Deterministic stub fallback — no network required.
"""
import json
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, TypeVar, Generic
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.llm_factory import create_llm_client
from app.schemas.workflow import BaseOutputSchema

T = TypeVar("T")

# ═══════════════════════════════════════════════════════════════
# BaseAgent — 不再绑定任何特定平台
# ═══════════════════════════════════════════════════════════════

class BaseAgent(ABC, Generic[T]):
    """Abstract base for all LangGraph agent nodes. Reads model_config from state."""

    def _get_client(self, state: Dict[str, Any]) -> AsyncOpenAI:
        """Create an OpenAI-compatible client from the user's model_config in state."""
        mc = state.get("model_config") or {}
        if not mc.get("base_url") or not mc.get("api_key"):
            raise RuntimeError(f"模型未配置 — 请在 model_config 中设置 base_url 和 api_key")
        return create_llm_client(mc)

    def _get_model_name(self, state: Dict[str, Any]) -> str:
        """Get model name from state's model_config, fallback to default."""
        mc = state.get("model_config") or {}
        return (mc.get("model") or "").strip() or "deepseek-chat"

    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Unique agent identifier, e.g. 'bible_agent'."""
        ...

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """System prompt for this agent."""
        ...

    @property
    def stub_mode(self) -> bool:
        return settings.STUB_MODE

    def _has_model_config(self, state: Dict[str, Any]) -> bool:
        mc = state.get("model_config") or {}
        return bool(mc.get("base_url") and mc.get("api_key"))

    async def _call_llm(self, state: Dict[str, Any], user_message: str, temperature: float = 0.7, max_tokens: int = 4096) -> str:
        """Call user-configured LLM with system prompt and user message."""
        client = self._get_client(state)
        model = self._get_model_name(state)
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=45.0,
                ),
                timeout=55.0,
            )
            return response.choices[0].message.content or ""
        except asyncio.TimeoutError:
            raise RuntimeError(f"LLM API 调用超时 (55s) — agent={self.agent_name}")

    async def _call_llm_json(self, state: Dict[str, Any], user_message: str) -> Dict[str, Any]:
        """Call LLM and parse JSON response. Retries once on parse failure."""
        raw = await self._call_llm(state, user_message)
        json_str = raw.strip()
        if json_str.startswith("```"):
            lines = json_str.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            json_str = "\n".join(lines)
        start = json_str.find("{")
        end = json_str.rfind("}") + 1
        if start >= 0 and end > start:
            json_str = json_str[start:end]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            retry_msg = user_message + "\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown formatting. Start with '{'."
            raw2 = await self._call_llm(state, retry_msg)
            json_str2 = raw2.strip()
            if json_str2.startswith("```"):
                lines = json_str2.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                json_str2 = "\n".join(lines)
            start2 = json_str2.find("{")
            end2 = json_str2.rfind("}") + 1
            if start2 >= 0 and end2 > start2:
                json_str2 = json_str2[start2:end2]
            return json.loads(json_str2)

    def _get_raw_client(self, state: Dict[str, Any]) -> AsyncOpenAI:
        """Direct access to the OpenAI-compatible client (for agents doing custom calls)."""
        return self._get_client(state)

    async def run(self, state: Dict[str, Any], override_stub: Optional[bool] = None) -> BaseOutputSchema[T]:
        use_stub = self.stub_mode if override_stub is None else override_stub
        try:
            if use_stub:
                data = await self._run_mock(state)
                return BaseOutputSchema[T](success=True, data=data, is_fallback=True, fallback_data={"mode": "stub", "agent": self.agent_name})
            else:
                data = await self._run_real(state)
                return BaseOutputSchema[T](success=True, data=data, is_fallback=False)
        except Exception as exc:
            try:
                fallback_data = await self._run_mock(state)
                return BaseOutputSchema[T](success=False, data=None, is_fallback=True,
                    fallback_data={"mode": "error_fallback", "agent": self.agent_name, "original_error": str(exc), "data": fallback_data},
                    error_code=type(exc).__name__, error_msg=str(exc))
            except Exception as fallback_exc:
                return BaseOutputSchema[T](success=False, data=None, is_fallback=False, error_code="DOUBLE_FAULT", error_msg=f"Real: {exc}; Fallback: {fallback_exc}")

    @abstractmethod
    async def _run_real(self, state: Dict[str, Any]) -> T: ...
    @abstractmethod
    async def _run_mock(self, state: Dict[str, Any]) -> T: ...


# ═══════════════════════════════════════════════════════════════
# Backward-compatible alias (used by agents with direct client access)
# ═══════════════════════════════════════════════════════════════

def get_deepseek_client():
    """Deprecated: use BaseAgent._get_client(state) instead.
    Kept for backward compatibility — creates client from env vars."""
    import os
    return AsyncOpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    )
