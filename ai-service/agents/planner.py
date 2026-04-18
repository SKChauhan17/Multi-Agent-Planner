import json
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


class PlanResponse(BaseModel):
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


def _sanitize_json_text(raw_text: str) -> str:
    cleaned = (raw_text or "").strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned[len("```json") :]
    elif cleaned.startswith("```"):
        cleaned = cleaned[len("```") :]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def _serialize_plan(plan: PlanResponse) -> str:
    if hasattr(plan, "model_dump_json"):
        return plan.model_dump_json()
    return plan.json()


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


def generate_plan(goal: str) -> str:
    """Takes a goal and returns a strictly structured JSON string of tasks."""

    prompt = f"""
You are an expert project planner. Break down the following goal into 5 to 10 actionable sub-tasks.

Rules:
- Assign a unique task_id to every task (example: T1, T2).
- If a task depends on another task, include prerequisite task_id values in dependencies.
- If no dependencies exist, return an empty array [].
- Generate recommended_date in YYYY-MM-DD format for each task.
- recommended_date is required for every task and cannot be empty.
- Respect any deadline context from the goal text.

Return ONLY valid JSON with this exact shape:
{{
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
            validated_payload = PlanResponse(**parsed_payload)
            return _serialize_plan(validated_payload)

        except (json.JSONDecodeError, ValidationError) as parse_error:
            print(
                f"WARNING: {provider}/{model_name} returned invalid JSON schema. "
                f"Trying next fallback. Details: {parse_error}"
            )
            continue
        except Exception as exc:
            error_str = str(exc).upper()
            if any(marker in error_str for marker in RETRYABLE_ERROR_MARKERS):
                print(
                    f"WARNING: {provider}/{model_name} hit a recoverable error. "
                    "Trying next fallback."
                )
                continue

            print(
                f"WARNING: {provider}/{model_name} hit a non-retryable error. "
                f"Trying next fallback. Details: {exc}"
            )
            continue

    print("WARNING: all planner models failed. Returning empty task list.")
    return json.dumps({"tasks": []})
