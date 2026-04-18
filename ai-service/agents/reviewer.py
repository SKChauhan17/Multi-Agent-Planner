import json
import logging
import os
from typing import List

from groq import Groq
from openai import OpenAI
from pydantic import BaseModel, ValidationError


class Task(BaseModel):
    task_id: str
    title: str
    description: str
    estimated_hours: int
    priority: str
    dependencies: List[str]
    recommended_date: str = ""


class ReviewResponse(BaseModel):
    review_summary: str
    tasks: List[Task]


FALLBACK_MODELS = [
    {"provider": "groq", "model": "llama-3.3-70b-versatile"},
    {"provider": "groq", "model": "openai/gpt-oss-120b"},
    {"provider": "groq", "model": "qwen/qwen3-32b"},
    {"provider": "groq", "model": "llama-3.1-8b-instant"},
    {"provider": "openrouter", "model": "openai/gpt-oss-120b:free"},
    {"provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct:free"},
    {"provider": "openrouter", "model": "qwen/qwen3-next-80b-a3b-instruct:free"},
    {"provider": "openrouter", "model": "google/gemma-4-31b-it:free"},
    {"provider": "openrouter", "model": "openai/gpt-oss-20b:free"},
]

RETRYABLE_ERROR_MARKERS = (
    "404",
    "NOT_FOUND",
    "429",
    "RESOURCE_EXHAUSTED",
    "RATE_LIMIT_EXCEEDED",
    "503",
    "UNAVAILABLE",
    "400",
    "INVALID_ARGUMENT",
    "500",
    "INTERNAL",
    "502",
    "BAD_GATEWAY",
    "TIMEOUT",
)

LOGGER = logging.getLogger("multi-agent-planner.reviewer")


def _sanitize_json_text(raw_text: str) -> str:
    cleaned = (raw_text or "").strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned[len("```json") :]
    elif cleaned.startswith("```"):
        cleaned = cleaned[len("```") :]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def _call_groq(model_name: str, prompt: str) -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing.")

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": "Return JSON only. Never use markdown."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=2200,
    )
    return response.choices[0].message.content or ""


def _call_openrouter(model_name: str, prompt: str) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing.")

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
        default_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000"),
            "X-Title": os.getenv("OPENROUTER_APP_NAME", "multi-agent-planner"),
        },
    )

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": "Return JSON only. Never use markdown."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=2200,
    )
    return response.choices[0].message.content or ""


def review_plan(goal: str, planner_json_output: str) -> dict:
    """Takes planner output and critiques it, returning a verified dictionary."""

    prompt = f"""
You are an expert project reviewer.

Given the goal and proposed tasks, produce a revised task list with better realism and sequencing.

Rules:
- review_summary must be plain text, direct, maximum 3 sentences.
- Assign unique task_id values for each task.
- Use dependencies for prerequisites, or [] when none exist.
- Generate recommended_date in YYYY-MM-DD format.
- recommended_date is required for every task and cannot be empty.

Return ONLY valid JSON with this shape:
{{
  "review_summary": "string",
  "tasks": [
    {{
      "task_id": "T1",
      "title": "string",
      "description": "string",
      "estimated_hours": 1,
      "priority": "High",
      "dependencies": [],
      "recommended_date": "2026-04-20"
    }}
  ]
}}

Goal: {goal}
Proposed Tasks (JSON): {planner_json_output}
"""

    for model_config in FALLBACK_MODELS:
        provider = model_config["provider"]
        model_name = model_config["model"]

        try:
            if provider == "groq":
                raw_response = _call_groq(model_name, prompt)
            else:
                raw_response = _call_openrouter(model_name, prompt)

            parsed_payload = json.loads(_sanitize_json_text(raw_response))
            validated_payload = ReviewResponse(**parsed_payload)

            if hasattr(validated_payload, "model_dump"):
                return validated_payload.model_dump()
            return validated_payload.dict()

        except (json.JSONDecodeError, ValidationError) as parse_error:
            LOGGER.warning(
                "%s/%s returned invalid JSON schema. Trying next fallback.",
                provider,
                model_name,
            )
            continue
        except Exception as exc:
            error_str = str(exc).upper()
            if any(marker in error_str for marker in RETRYABLE_ERROR_MARKERS):
                LOGGER.warning(
                    "%s/%s hit a recoverable error. Trying next fallback.",
                    provider,
                    model_name,
                )
                continue

            LOGGER.warning(
                "%s/%s hit a non-retryable error. Trying next fallback.",
                provider,
                model_name,
            )
            continue

    LOGGER.warning("All reviewer models failed. Returning structured fallback.")
    return {
        "tasks": [],
        "revised_tasks": [],
        "review_summary": (
            "Warning: all configured Groq and OpenRouter models failed to return valid "
            "JSON. Please try again shortly."
        ),
    }
