"""
AI-NUSS 3.0 — PromptLoader: Dynamic Prompt Registry
Loads markdown prompt templates from the prompts/ directory.
Supports variable interpolation for runtime customization.
"""
import os
import re
from typing import Dict, Optional


# === Prompt directory ===
_PROMPT_DIR = os.path.dirname(os.path.abspath(__file__))


# === In-memory cache ===
_PROMPT_CACHE: Dict[str, str] = {}


def load_prompt(name: str, variables: Optional[Dict[str, str]] = None) -> str:
    """
    Load a prompt template by agent name.

    Args:
        name: Agent name (e.g. 'bible_agent', 'character_agent')
        variables: Optional dict of variable replacements.

    Returns:
        The rendered prompt string with variables interpolated.

    Raises:
        FileNotFoundError: If the prompt file does not exist.
    """
    if name not in _PROMPT_CACHE:
        file_path = os.path.join(_PROMPT_DIR, f"{name}.md")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Prompt template not found: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            _PROMPT_CACHE[name] = f.read()

    prompt = _PROMPT_CACHE[name]

    # Variable interpolation: {{ variable_name }}
    if variables:
        for key, value in variables.items():
            prompt = prompt.replace(f"{{{{{{{{ {key} }}}}}}}}", str(value))
            prompt = prompt.replace(f"{{{{ {key} }}}}", str(value))

    return prompt


def list_prompts() -> list[str]:
    """List all available prompt template names."""
    prompts = []
    for fname in os.listdir(_PROMPT_DIR):
        if fname.endswith(".md") and fname != "README.md":
            prompts.append(fname.replace(".md", ""))
    return sorted(prompts)


def reload_prompts() -> None:
    """Clear the prompt cache (useful for hot-reloading during development)."""
    _PROMPT_CACHE.clear()
