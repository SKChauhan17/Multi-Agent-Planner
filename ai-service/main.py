import json
import requests
from pathlib import Path
from datetime import date, datetime, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv


from agents.planner import generate_plan
from agents.reviewer import review_plan

# Load env variables
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

VALID_PRIORITIES = {"High", "Medium", "Low"}
VALID_STATUSES = {"todo", "in-progress", "done"}
MIN_TASK_COUNT = 5
MAX_TASK_COUNT = 10

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


class ReReviewRequest(BaseModel):
    goal: str
    tasks: list[dict]


class DailyStandupRequest(BaseModel):
    goal: str
    tasks: list[dict]


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

    task_id = str(task.get("task_id", f"T{index+1}")).strip()
    dependencies = task.get("dependencies", [])
    if not isinstance(dependencies, list):
        dependencies = []

    recommended_date = str(task.get("recommended_date", "")).strip()

    import uuid
    fallback_id = str(task.get("id", f"local-{uuid.uuid4()}"))

    return {
        "id": fallback_id,
        "task_id": task_id,
        "title": title,
        "description": description,
        "estimated_hours": estimated_hours,
        "priority": priority,
        "status": status,
        "dependencies": dependencies,
        "recommended_date": recommended_date,
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


def _parse_deadline_from_goal(goal: str) -> date | None:
    marker = "Deadline:"
    idx = goal.find(marker)
    if idx == -1:
        return None

    raw_part = goal[idx + len(marker):].split("|", 1)[0].strip()
    if not raw_part or raw_part.lower() == "none":
        return None

    # Goal string carries ISO date from frontend (YYYY-MM-DD)
    raw_date = raw_part[:10]
    try:
        return date.fromisoformat(raw_date)
    except ValueError:
        return None


def _normalize_iso_date(value: str) -> str | None:
    text = value.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def _ensure_recommended_dates(tasks: list[dict], goal: str) -> list[dict]:
    if not tasks:
        return tasks

    today = datetime.now().date()
    deadline = _parse_deadline_from_goal(goal)
    if deadline is not None and deadline < today:
        deadline = today

    total = len(tasks)
    horizon_days = 0 if deadline is None else max((deadline - today).days, 0)
    step_days = max(1, horizon_days // max(total, 1)) if deadline is not None else 3

    for index, task in enumerate(tasks):
        normalized_existing = _normalize_iso_date(str(task.get("recommended_date", "")))
        if normalized_existing:
            task["recommended_date"] = normalized_existing
            continue

        if deadline is None:
            target_date = today + timedelta(days=step_days * (index + 1))
        else:
            candidate = today + timedelta(days=step_days * (index + 1))
            target_date = min(deadline, candidate)

        task["recommended_date"] = target_date.isoformat()

    return tasks


def _ensure_task_count(tasks: list[dict], goal: str) -> list[dict]:
    bounded_tasks = tasks[:MAX_TASK_COUNT] if tasks else []

    goal_text = goal.split("|", 1)[0].replace("Goal:", "").strip() or "the project goal"

    filler_templates = [
        (
            "Clarify project scope",
            f"Define concrete deliverables, constraints, and success criteria for {goal_text}.",
        ),
        (
            "Set up implementation baseline",
            f"Prepare required tooling, structure, and foundational assets for {goal_text}.",
        ),
        (
            "Build core deliverable",
            f"Implement the primary workstream that delivers the core outcome for {goal_text}.",
        ),
        (
            "Validate and refine output",
            f"Test, review, and fix critical gaps before finalizing {goal_text}.",
        ),
        (
            "Finalize and hand off",
            f"Package outcomes, document decisions, and complete closure steps for {goal_text}.",
        ),
    ]

    existing_ids = {
        str(task.get("task_id", "")).strip()
        for task in bounded_tasks
        if str(task.get("task_id", "")).strip()
    }

    def next_task_id(seed_index: int) -> str:
        candidate = seed_index
        while True:
            task_id = f"T{candidate}"
            if task_id not in existing_ids:
                existing_ids.add(task_id)
                return task_id
            candidate += 1

    import uuid

    while len(bounded_tasks) < MIN_TASK_COUNT:
        index = len(bounded_tasks)
        title, description = filler_templates[min(index, len(filler_templates) - 1)]
        dependency_task_id = (
            str(bounded_tasks[-1].get("task_id", "")).strip() if bounded_tasks else ""
        )

        bounded_tasks.append(
            {
                "id": f"local-{uuid.uuid4()}",
                "task_id": next_task_id(index + 1),
                "title": title,
                "description": description,
                "estimated_hours": 2,
                "priority": "Medium",
                "status": "todo",
                "dependencies": [dependency_task_id] if dependency_task_id else [],
                "recommended_date": "",
            }
        )

    return bounded_tasks


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


def _persist_plan(goal: str, tasks: list[dict]) -> dict:
    node_payload = {
        "goal": goal,
        "tasks": tasks,
    }

    print(f"🚀 DEBUG: Dispatching to Node.js Management API: {node_payload}")

    node_response = requests.post("http://localhost:4000/api/plans", json=node_payload, timeout=30)
    node_response.raise_for_status()
    node_data = node_response.json()
    final_plan = node_data.get("data") if isinstance(node_data, dict) else None
    if not isinstance(final_plan, dict):
        raise ValueError("Task API response missing plan data.")

    normalized_persisted_tasks = _normalize_tasks(final_plan.get("tasks"))
    if normalized_persisted_tasks:
        final_plan["tasks"] = normalized_persisted_tasks

    return final_plan


def _preserve_runtime_fields(base_tasks: list[dict], revised_tasks: list[dict]) -> list[dict]:
    status_by_task_id: dict[str, str] = {}
    id_by_task_id: dict[str, str] = {}

    for task in base_tasks:
        task_id = str(task.get("task_id", "")).strip()
        if not task_id:
            continue

        status_value = str(task.get("status", "todo")).strip() or "todo"
        if status_value not in VALID_STATUSES:
            status_value = "todo"

        status_by_task_id[task_id] = status_value

        row_id = str(task.get("id", "")).strip()
        if row_id:
            id_by_task_id[task_id] = row_id

    import uuid

    for task in revised_tasks:
        task_id = str(task.get("task_id", "")).strip()

        if task_id and task_id in status_by_task_id:
            task["status"] = status_by_task_id[task_id]

        if task_id and task_id in id_by_task_id:
            task["id"] = id_by_task_id[task_id]
        elif not str(task.get("id", "")).strip():
            task["id"] = f"local-{uuid.uuid4()}"

    return revised_tasks


def _build_daily_standup(goal: str, tasks: list[dict]) -> dict:
    done_tasks = [task for task in tasks if task.get("status") == "done"]
    in_progress_tasks = [task for task in tasks if task.get("status") == "in-progress"]
    todo_tasks = [task for task in tasks if task.get("status") == "todo"]

    done_ids = {
        str(task.get("task_id", "")).strip()
        for task in done_tasks
        if str(task.get("task_id", "")).strip()
    }

    blocked_tasks: list[dict] = []
    for task in todo_tasks + in_progress_tasks:
        deps = [
            str(dep).strip()
            for dep in task.get("dependencies", [])
            if str(dep).strip()
        ]
        if deps and any(dep not in done_ids for dep in deps):
            blocked_tasks.append(task)

    done_titles = [str(task.get("title", "")).strip() for task in done_tasks if str(task.get("title", "")).strip()]
    in_progress_titles = [str(task.get("title", "")).strip() for task in in_progress_tasks if str(task.get("title", "")).strip()]
    blocked_titles = [str(task.get("title", "")).strip() for task in blocked_tasks if str(task.get("title", "")).strip()]

    summary_parts: list[str] = []
    summary_parts.append(
        f"Goal focus: {goal.split('|', 1)[0].replace('Goal:', '').strip() or 'project execution'}"
    )
    summary_parts.append(
        f"Done: {len(done_titles)} | In Progress: {len(in_progress_titles)} | Blocked: {len(blocked_titles)}"
    )

    if blocked_titles:
        summary_parts.append(
            f"Primary blockers: {', '.join(blocked_titles[:3])}."
        )
    elif in_progress_titles:
        summary_parts.append(
            f"Most active right now: {', '.join(in_progress_titles[:3])}."
        )
    else:
        summary_parts.append("No blockers detected; next step is to begin the highest-priority todo item.")

    return {
        "standup_summary": " ".join(summary_parts),
        "done": done_titles,
        "in_progress": in_progress_titles,
        "blocked": blocked_titles,
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

        safe_tasks = _ensure_task_count(safe_tasks, request.goal)
        safe_tasks = _ensure_recommended_dates(safe_tasks, request.goal)

        if not safe_tasks:
            if planner_warning:
                review_summary = f"{planner_warning} {review_summary}".strip()
            return _build_local_response(request.goal, [], review_summary)

        try:
            final_plan = _persist_plan(request.goal, safe_tasks)
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


@app.post("/re-review-plan")
def rereview_plan_endpoint(request: ReReviewRequest):
    try:
        base_tasks = _normalize_tasks(request.tasks)
        if not base_tasks:
            return _build_local_response(
                request.goal,
                [],
                "Reviewer rerun skipped because no task payload was provided.",
            )

        normalized_input_tasks = _ensure_task_count(base_tasks, request.goal)
        normalized_input_tasks = _ensure_recommended_dates(normalized_input_tasks, request.goal)

        review_summary = "Reviewer rerun completed and synchronized."
        reviewed_dict: dict = {}

        try:
            reviewed_dict = review_plan(request.goal, json.dumps({"tasks": normalized_input_tasks}))
            if isinstance(reviewed_dict, dict):
                review_summary = str(reviewed_dict.get("review_summary") or review_summary)
        except Exception as review_error:
            print(f"WARNING: Reviewer rerun fallback engaged: {review_error}")

        extracted_tasks = _extract_task_candidates(reviewed_dict)
        safe_tasks = _normalize_tasks(extracted_tasks)
        if not safe_tasks:
            safe_tasks = normalized_input_tasks

        safe_tasks = _ensure_task_count(safe_tasks, request.goal)
        safe_tasks = _ensure_recommended_dates(safe_tasks, request.goal)
        safe_tasks = _preserve_runtime_fields(normalized_input_tasks, safe_tasks)

        try:
            final_plan = _persist_plan(request.goal, safe_tasks)
        except (requests.exceptions.RequestException, ValueError) as node_error:
            print(f"WARNING: Rerun persistence fallback because task API is unavailable: {node_error}")
            review_summary = (
                f"{review_summary} Task API persistence unavailable; returned a local fallback plan."
            ).strip()
            return _build_local_response(request.goal, safe_tasks, review_summary)

        return {
            "review_summary": review_summary,
            "final_plan": final_plan,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return _build_local_response(request.goal, [], f"Unexpected rerun error: {e}")


@app.post("/daily-standup")
def daily_standup_endpoint(request: DailyStandupRequest):
    safe_tasks = _normalize_tasks(request.tasks)
    safe_tasks = _ensure_recommended_dates(safe_tasks, request.goal)
    return _build_daily_standup(request.goal, safe_tasks)
