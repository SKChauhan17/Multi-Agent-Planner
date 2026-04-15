from google import genai
from google.genai import types

def generate_plan(goal: str) -> str:
    """Takes a goal and returns an unparsed raw JSON string from the LLM"""
    client = genai.Client()
    
    prompt = f"""
    You are an expert project planner. Break down the following goal into 5 to 10 actionable sub-tasks.
    
    The output MUST be a JSON array of objects. Each object must have exactly these properties:
    - "title": a short string representation of the task
    - "description": detailed string explaining what to do
    - "estimated_hours": a number greater than 0
    - "priority": must be strictly "High", "Medium", or "Low"
    - "status": must be strictly "todo"

    Goal: {goal}
    """
    
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    return response.text
