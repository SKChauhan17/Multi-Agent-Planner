import json
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv


from agents.planner import generate_plan
from agents.reviewer import review_plan

# Load env variables
load_dotenv()

VALID_PRIORITIES = {"High", "Medium", "Low"}
VALID_STATUSES = {"todo", "in-progress", "done"}

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


def _normalize_task(task: object, index: int) -> dict | None:
    if not isinstance(task, dict):
        return None

    title = str(task.get("title", "")).strip() or f"Task {index + 1}"
    description = str(task.get("description", "")).strip() or f"Complete {title.lower()}."

    estimated_hours = task.get("estimated_hours", 1)
    try:
        estimated_hours = max(1, int(float(estimated_hours)))
    except (TypeError, ValueError):
        estimated_hours = 1

    priority = str(task.get("priority", "Medium")).strip().title() or "Medium"
    if priority not in VALID_PRIORITIES:
        priority = "Medium"

    status = str(task.get("status", "todo")).strip() or "todo"
    if status not in VALID_STATUSES:
        status = "todo"

    return {
        "title": title,
        "description": description,
        "estimated_hours": estimated_hours,
        "priority": priority,
        "status": status,
    }


def _normalize_tasks(tasks: object) -> list[dict]:
    if not isinstance(tasks, list):
        return []

    normalized_tasks: list[dict] = []
    for index, task in enumerate(tasks):
        normalized_task = _normalize_task(task, index)
        if normalized_task:
            normalized_tasks.append(normalized_task)

    return normalized_tasks


def _extract_task_candidates(reviewed_dict: object) -> list[object]:
    if not isinstance(reviewed_dict, dict):
        return []

    direct_tasks = reviewed_dict.get("tasks")
    if isinstance(direct_tasks, list):
        return direct_tasks

    revised_tasks = reviewed_dict.get("revised_tasks")
    if isinstance(revised_tasks, list):
        return revised_tasks

    final_plan = reviewed_dict.get("final_plan")
    if isinstance(final_plan, dict):
        nested_tasks = final_plan.get("tasks")
        if isinstance(nested_tasks, list):
            return nested_tasks

    return []


def _build_local_response(goal: str, tasks: list[dict], review_summary: str) -> dict:
    summary = review_summary.strip() if isinstance(review_summary, str) else ""
    if not summary:
        summary = "The AI services were unavailable, so a local fallback plan was returned."

    return {
        "review_summary": summary,
        "final_plan": {
            "id": "local-fallback",
            "goal": goal,
            "tasks": tasks,
        },
    }

@app.post("/generate-plan")
def generate_plan_endpoint(request: PlanRequest):
    try:
        raw_planner_json = "[]"
        planner_warning = ""

        try:
            raw_planner_json = generate_plan(request.goal)
        except Exception as planner_error:
            planner_warning = f"Planner fallback engaged: {planner_error}"
            print(planner_warning)

        planner_tasks: list[dict] = []
        try:
            planner_payload = json.loads(raw_planner_json)
            if isinstance(planner_payload, dict):
                planner_candidates = (
                    planner_payload.get("tasks")
                    or planner_payload.get("revised_tasks")
                    or (planner_payload.get("final_plan") or {}).get("tasks", [])
                )
            elif isinstance(planner_payload, list):
                planner_candidates = planner_payload
            else:
                planner_candidates = []
            planner_tasks = _normalize_tasks(planner_candidates)
        except (json.JSONDecodeError, TypeError, ValueError) as parse_error:
            print(f"WARNING: Planner returned invalid JSON, using empty fallback: {parse_error}")

        reviewed_dict: dict = {}
        review_summary = "Agent review completed and synchronized."

        try:
            reviewed_dict = review_plan(request.goal, raw_planner_json)
            print("RAW REVIEWER JSON:", reviewed_dict)
            if isinstance(reviewed_dict, dict):
                review_summary = str(reviewed_dict.get("review_summary") or review_summary)
        except Exception as review_error:
            print(f"WARNING: Reviewer fallback engaged: {review_error}")

        extracted_tasks = _extract_task_candidates(reviewed_dict)
        safe_tasks = _normalize_tasks(extracted_tasks)

        if not safe_tasks:
            safe_tasks = planner_tasks

        if not safe_tasks:
            if planner_warning:
                review_summary = f"{planner_warning} {review_summary}".strip()
            return _build_local_response(request.goal, [], review_summary)

        node_payload = {
            "goal": request.goal,
            "tasks": safe_tasks,
        }

        print(f"🚀 DEBUG: Dispatching to Node.js Management API: {node_payload}")

        try:
            node_response = requests.post("http://localhost:4000/api/plans", json=node_payload, timeout=30)
            node_response.raise_for_status()
            node_data = node_response.json()
            final_plan = node_data.get("data") if isinstance(node_data, dict) else None
            if not isinstance(final_plan, dict):
                raise ValueError("Task API response missing plan data.")
        except (requests.exceptions.RequestException, ValueError) as node_error:
            print(f"WARNING: Falling back to local plan response because task API is unavailable: {node_error}")
            if planner_warning:
                review_summary = f"{planner_warning} {review_summary}".strip()
            review_summary = f"{review_summary} Task API persistence unavailable; returned a local fallback plan.".strip()
            return _build_local_response(request.goal, safe_tasks, review_summary)

        return {
            "review_summary": review_summary,
            "final_plan": final_plan,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return _build_local_response(request.goal, [], f"Unexpected backend error: {e}")
