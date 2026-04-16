import json
from pydantic import BaseModel
from typing import List
from google import genai
from google.genai import types
from google.genai.errors import APIError

class Task(BaseModel):
    title: str
    description: str
    estimated_hours: int
    priority: str

class PlanResponse(BaseModel):
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

def generate_plan(goal: str) -> str:
    """Takes a goal and returns a strictly structured JSON string of tasks"""
    client = genai.Client()
    
    prompt = f"""
    You are an expert project planner. Break down the following goal into 5 to 10 actionable sub-tasks.
    
    Goal: {goal}
    """
    
    for model_name in FALLBACK_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PlanResponse
                )
            )
            response_text = response.text or ""
            json.loads(response_text)
            return response.text
        except Exception as e:
            error_str = str(e).upper()
            if isinstance(e, json.JSONDecodeError) or any(keyword in error_str for keyword in RETRYABLE_ERROR_MARKERS):
                print(f"WARNING: {model_name} returned a recoverable error, falling back to next model...")
                continue
            else:
                raise e
                
    print("🚨 API Quota entirely depleted across all fallback models!")
    return json.dumps({"tasks": []})
