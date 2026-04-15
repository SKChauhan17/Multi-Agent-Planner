import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv


from agents.planner import generate_plan
from agents.reviewer import review_plan

# Load env variables
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PlanRequest(BaseModel):
    goal: str

@app.post("/generate-plan")
def generate_plan_endpoint(request: PlanRequest):
    try:
        # Step 1: Planner Agent
        raw_planner_json = generate_plan(request.goal)
        
        # Step 2: Reviewer Agent
        reviewed_payload = review_plan(request.goal, raw_planner_json)
        
        # Validate reviewer payload roughly
        revised_tasks = reviewed_payload.get("revised_tasks", [])
        review_summary = reviewed_payload.get("review_summary", "No summary provided.")

        # Step 3: Forward back to task-api
        payload_for_node = {
            "goal": request.goal,
            "tasks": revised_tasks
        }
        
        try:
            node_response = requests.post("http://localhost:4000/api/plans", json=payload_for_node)
            node_response.raise_for_status() # Rise an exception for bad status codes
        except requests.exceptions.RequestException as e:
            # If the Node API is down or rejects the payload
            raise HTTPException(status_code=500, detail=f"Failed to communicate with task API: {str(e)}")

        node_data = node_response.json()
        
        # Step 4: Return composite response
        return {
            "review_summary": review_summary,
            "final_plan": node_data.get("data")
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
