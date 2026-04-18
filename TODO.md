# 📝 Multi-Agent Task Planner - Project Checklist

## 🎯 Compulsory Requirements

### 1. Frontend (Next.js / TypeScript)
- [x] Create a text area for entering a high-level goal.
- [x] Add optional inputs for Deadline and Priority level.
- [x] Add a 'Generate Plan' button to trigger the AI pipeline.
- [x] Implement live status indicators (e.g., 'Planner thinking...' -> 'Done').
- [x] Render tasks visually (Task Tree/Cards) showing dependencies.
- [x] Display the Reviewer agent's plain-language critique below the plan.
- [x] Allow users to mark tasks as done (Todo -> In Progress -> Done).
- [x] Ensure task status updates persist to the database via API.

### 2. AI Service (Python / FastAPI)
- [x] **Planner Agent:** Generate 5–10 sub-tasks from the user's goal.
- [x] Enforce structured JSON output (Pydantic).
- [x] Include required fields: `title`, `description`, `estimated_hours`, `priority`, `task_id`, `dependencies`.
- [x] **Reviewer Agent:** Critique the Planner's output (flag unrealistic times, missing tasks, etc.).
- [x] Return a revised plan and a plain-text review summary.
- [x] Keep agents as clearly separate functions/classes (not one monolithic prompt).

### 3. Task API (Node.js / Express)
- [x] Configure SQLite for data storage.
- [x] Return proper HTTP status codes and JSON error bodies.
- [x] Implement `POST /plans` (Create new plan from AI output).
- [x] Implement `GET /plans/:id` (Fetch a plan and its tasks).
- [x] Implement `PATCH /tasks/:id` (Update task status).
- [x] Implement `DELETE /plans/:id` (Delete plan and cascade delete tasks).

### 4. DevOps & Submission (Phase 7 - PENDING)
- External/manual actions still required for deployment and final submission URLs.
- [x] Ensure project is a Monorepo (`/ai-service`, `/task-api`, `/frontend`).
- [ ] Push all code to a public GitHub repository named `multi-agent-planner`.
- [x] Create `README.md` with an architecture diagram (ASCII is fine).
- [x] Add setup steps and `.env.example` files to the repository.
- [ ] Deploy Python AI Service to Railway.
- [ ] Deploy Node.js Task API to Railway (same project, second service).
- [ ] Deploy Next.js Frontend to Vercel.
- [ ] Submit GitHub URL + Live Demo URL.

---

## ✨ Bonus Features (Optional / Extra Credit)
- [x] Allow users to edit individual tasks manually.
- [x] Allow users to re-trigger the Reviewer agent to critique manual edits.
- [x] Add a "daily standup" mode (agent summarizes what's done vs. blocked).
- [x] Support multiple plans per session (Plan History).
- [x] Visualize the agent's step-by-step chain-of-thought live on screen.