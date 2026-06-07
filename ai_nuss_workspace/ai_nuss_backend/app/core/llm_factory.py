"""
AI-NUSS 3.0 — Unified LLM Client Factory
OpenAI-compatible: supports DeepSeek, OpenAI, OpenRouter, SiliconFlow, Moonshot, Zhipu, Aliyun Bailian, etc.
Replaces global singleton with per-config clients.
"""
from typing import Optional, Dict, Any
from openai import AsyncOpenAI


def create_llm_client(model_config: Dict[str, Any]) -> AsyncOpenAI:
    """
    Create an AsyncOpenAI client from user-provided model configuration.

    model_config = {
        "provider": "deepseek",        # human-readable label (optional)
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
        "api_key": "sk-..."
    }
    """
    base_url = (model_config.get("base_url") or "").strip().rstrip("/")
    api_key = (model_config.get("api_key") or "").strip()

    if not base_url:
        raise ValueError("Base URL is required")
    if not api_key:
        raise ValueError("API Key is required")

    return AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=60.0,
        max_retries=2,
    )


async def test_llm_connection(model_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Test a model configuration by sending a minimal chat completion request.
    Returns {"success": True} or {"success": False, "error": "..."}.
    """
    try:
        client = create_llm_client(model_config)
        model = (model_config.get("model") or "").strip() or "gpt-3.5-turbo"
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
            timeout=15.0,
        )
        if resp.choices and len(resp.choices) > 0:
            return {"success": True}
        else:
            return {"success": False, "error": "Empty response from model"}
    except Exception as e:
        return {"success": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}
