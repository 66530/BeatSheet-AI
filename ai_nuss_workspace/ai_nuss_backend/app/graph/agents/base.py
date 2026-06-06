"""
AI-NUSS 3.0 — Unified BaseAgent with DeepSeek API Integration
Chapter 14 §2: MOCK_PATH / REAL_PATH routing.

REAL_PATH: Calls DeepSeek API (OpenAI-compatible) via OpenAI SDK.
MOCK_PATH: Deterministic stub fallback — no network required.
"""
import json
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, TypeVar, Generic
from openai import AsyncOpenAI
from app.core.config import settings
from app.schemas.workflow import BaseOutputSchema
from app.prompts.loader import load_prompt

T = TypeVar("T")

# ═══════════════════════════════════════════════════════════════
# DeepSeek Client (OpenAI-compatible)
# ═══════════════════════════════════════════════════════════════

_deepseek_client: Optional[AsyncOpenAI] = None


def get_deepseek_client() -> AsyncOpenAI:
    """Lazily create the DeepSeek-compatible OpenAI client."""
    global _deepseek_client
    if _deepseek_client is None:
        _deepseek_client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
        )
    return _deepseek_client


# ═══════════════════════════════════════════════════════════════
# BaseAgent
# ═══════════════════════════════════════════════════════════════

class BaseAgent(ABC, Generic[T]):
    """
    Abstract base for all LangGraph agent nodes.
    Routes to DeepSeek API (REAL_PATH) or deterministic stub (MOCK_PATH).
    """

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
    def model_name(self) -> str:
        """DeepSeek model name."""
        return settings.DEEPSEEK_MODEL

    @property
    def stub_mode(self) -> bool:
        """Stub mode ON = use mock data, OFF = call DeepSeek API."""
        return settings.STUB_MODE

    def _has_api_key(self) -> bool:
        """Check if DeepSeek API key is configured."""
        return bool(settings.DEEPSEEK_API_KEY)

    async def _call_deepseek(self, user_message: str) -> str:
        """
        Call DeepSeek API with system prompt and user message.
        Returns the raw text response. 60s timeout to avoid hanging.
        """
        import asyncio
        client = get_deepseek_client()
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.7,
                    max_tokens=4096,
                    timeout=45.0,  # HTTP-level timeout
                ),
                timeout=55.0,  # asyncio-level timeout (slightly longer)
            )
            return response.choices[0].message.content or ""
        except asyncio.TimeoutError:
            raise RuntimeError(f"DeepSeek API 调用超时 (55s) — agent={self.agent_name}")

    async def _call_deepseek_json(self, user_message: str) -> Dict[str, Any]:
        """
        Call DeepSeek API and parse JSON response.
        Includes retry with stricter JSON instructions on failure.
        """
        raw = await self._call_deepseek(user_message)

        # Try to extract JSON from response (handle markdown code blocks)
        json_str = raw.strip()
        if json_str.startswith("```"):
            # Remove markdown code fences
            lines = json_str.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            json_str = "\n".join(lines)

        # Find JSON object boundaries if extra text exists
        start = json_str.find("{")
        end = json_str.rfind("}") + 1
        if start >= 0 and end > start:
            json_str = json_str[start:end]

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            # Retry once with stricter instructions
            retry_msg = (
                user_message
                + "\n\nIMPORTANT: You MUST respond with ONLY valid JSON. "
                + "No markdown formatting, no explanation outside the JSON object. "
                + "Start your response with '{' and end with '}'."
            )
            raw2 = await self._call_deepseek(retry_msg)
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

    async def run(
        self,
        state: Dict[str, Any],
        override_stub: Optional[bool] = None,
    ) -> BaseOutputSchema[T]:
        """
        Unified agent entry point.
        Routes to MOCK_PATH or REAL_PATH (DeepSeek) based on stub_mode.
        NEVER throws uncaught exceptions.
        """
        use_stub = self.stub_mode if override_stub is None else override_stub

        try:
            if use_stub:
                data = await self._run_mock(state)
                return BaseOutputSchema[T](
                    success=True,
                    data=data,
                    is_fallback=True,
                    fallback_data={"mode": "stub", "agent": self.agent_name},
                )
            else:
                data = await self._run_real(state)
                return BaseOutputSchema[T](
                    success=True,
                    data=data,
                    is_fallback=False,
                )
        except Exception as exc:
            # Fallback to mock on error
            try:
                fallback_data = await self._run_mock(state)
                return BaseOutputSchema[T](
                    success=False,
                    data=None,
                    is_fallback=True,
                    fallback_data={
                        "mode": "error_fallback",
                        "agent": self.agent_name,
                        "original_error": str(exc),
                        "data": fallback_data,
                    },
                    error_code=type(exc).__name__,
                    error_msg=str(exc),
                )
            except Exception as fallback_exc:
                return BaseOutputSchema[T](
                    success=False,
                    data=None,
                    is_fallback=False,
                    error_code="DOUBLE_FAULT",
                    error_msg=f"Real: {exc}; Fallback: {fallback_exc}",
                )

    @abstractmethod
    async def _run_real(self, state: Dict[str, Any]) -> T:
        """REAL_PATH: Call DeepSeek API."""
        ...

    @abstractmethod
    async def _run_mock(self, state: Dict[str, Any]) -> T:
        """MOCK_PATH: Deterministic stub."""
        ...
