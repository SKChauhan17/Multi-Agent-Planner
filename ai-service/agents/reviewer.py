from pydantic import BaseModel
from typing import List
import json
from google import genai
from google.genai import types
from google.genai.errors import APIError

class Task(BaseModel):
    title: str
    description: str
    estimated_hours: int
    priority: str

class ReviewResponse(BaseModel):
    review_summary: str
    tasks: List[Task]

FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]
RETRYABLE_ERROR_MARKERS = (
    "404",
    "NOT_FOUND",
    "429",
    "RESOURCE_EXHAUSTED",
    "503",
    "UNAVAILABLE",
    "400",
    "INVALID_ARGUMENT",
    "500",
    "INTERNAL",
)

def review_plan(goal: str, planner_json_output: str) -> dict:
    """Takes the planner output and critiques it, returning a verified python dictionary"""
    client = genai.Client()
    
    prompt = f"""
    You are an expert project reviewer. You have received a proposed task list designed to achieve a specific goal.
    Your job is to critique it for missing steps or unrealistic timeframes, and produce a revised version.

    Goal: {goal}
    Proposed Tasks (JSON): {planner_json_output}

    Instructions for review_summary:
    - CRITICAL: Keep your review_summary extremely concise. Maximum 3 sentences. 
    - Be punchy and direct. 
    - DO NOT use markdown formatting like **bold** or bullet points. 
    - Return plain text only.
    """

    for model_name in FALLBACK_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ReviewResponse
                )
            )
            # We parse the result using the enforced schema
            return json.loads(response.text)
        except Exception as e:
            error_str = str(e).upper()
            if isinstance(e, json.JSONDecodeError) or any(code in error_str for code in RETRYABLE_ERROR_MARKERS):
                print(f"WARNING: {model_name} returned a recoverable error, falling back to next model...")
                continue
            else:
                raise e

    print("🚨 API Quota entirely depleted across all fallback models!")
    # Return a structured fallback dictionary matching frontend expectations
    return {
        "tasks": [],
        "revised_tasks": [],
        "review_summary": "Warning: The API quota is exhausted across all available AI models. Unable to generate task roadmap at this time. Please try again later."
    }
