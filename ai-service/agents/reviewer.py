import json
from google import genai
from google.genai import types

def review_plan(goal: str, planner_json_output: str) -> dict:
    """Takes the planner output and critiques it, returning a verified python dictionary matching the final payload format"""
    client = genai.Client()
    
    prompt = f"""
    You are an expert project reviewer. You have received a proposed task list designed to achieve a specific goal.
    Your job is to critique it for missing steps or unrealistic timeframes, and produce a revised version.

    Goal: {goal}
    Proposed Tasks (JSON): {planner_json_output}

    Return a tightly structured JSON object with exactly two keys:
    - "revised_tasks": An array of updated tasks (each containing strictly: title, description, estimated_hours, priority, status). Status must always be "todo".
    - "review_summary": A plain language string detailing what you changed and why.
    """

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    
    # We parse the result since models configured with JSON response type should return valid JSON
    return json.loads(response.text)
