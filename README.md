# Multi-Agent Planner

A warm, editorial-style planning workspace that turns one goal into a realistic roadmap you can edit, re-review, and execute.

Documentation style note: this README set follows the clarity and tone direction defined in `DESIGN.md`.

## At A Glance

| Layer | Stack | Responsibility |
|---|---|---|
| Frontend | Next.js 16 + React 19 | Goal capture, task editing, history, standup view |
| AI Service | FastAPI + model fallback chain | Planner/reviewer orchestration and normalization |
| Task API | Express + TypeScript + SQLite | Durable storage for plans and task lifecycle |

## Architecture (Clean ASCII)

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-AGENT PLANNER FLOW                           │
└───────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐      POST /generate-plan       ┌──────────────────────────────┐
│ Frontend                     │ ──────────────────────────────> │ AI Service                   │
│ Next.js 16 + React 19        │      POST /re-review-plan      │ FastAPI                      │
│ http://localhost:3000        │ ──────────────────────────────> │ http://localhost:8000        │
│                              │      POST /daily-standup       │                              │
└───────────────┬──────────────┘ ──────────────────────────────> └──────────────┬──────────────┘
                │                     reviewed plan + standup                   │
                │ <───────────────────────────────────────────────────────────── │
                │                                                               │ POST /api/plans
                │ PATCH /api/tasks/:id                                          │
                ▼                                                               ▼
┌──────────────────────────────┐      read/write plans + tasks   ┌──────────────────────────────┐
│ Task API                     │ ───────────────────────────────> │ SQLite planner.db            │
│ Express + TypeScript         │ <─────────────────────────────── │ task-api/data/planner.db     │
│ http://localhost:4000        │           query results          │                              │
└──────────────────────────────┘                                  └──────────────────────────────┘
```

## Repository Map

```text
multi-agent-planner/
├─ ai-service/      FastAPI planner/reviewer orchestration
├─ task-api/        Express + SQLite persistence API
├─ frontend/        Next.js planning studio UI
├─ DESIGN.md        Design language and writing direction
└─ README.md
```

## Quick Start

### 1) Prerequisites

- Node.js 20+
- Python 3.10+
- npm 10+

### 2) Create local env files

```powershell
Copy-Item ai-service/.env.example ai-service/.env
Copy-Item task-api/.env.example task-api/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Add your API keys in `ai-service/.env`.

### 3) Install dependencies

```powershell
python -m venv ai-service/venv
ai-service/venv/Scripts/python.exe -m pip install -r ai-service/requirements.txt
npm install --prefix task-api
npm install --prefix frontend
```

### 4) Run all services (three terminals)

Terminal A:

```powershell
npm run dev --prefix task-api
```

Terminal B:

```powershell
cd ai-service
venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Terminal C:

```powershell
npm run dev --prefix frontend
```

Open http://localhost:3000.

## API Surface

| Service | Endpoint | Purpose |
|---|---|---|
| AI Service | `POST /generate-plan` | Build and review the initial task roadmap |
| AI Service | `POST /re-review-plan` | Critique manually edited tasks |
| AI Service | `POST /daily-standup` | Summarize done, in-progress, and blocked work |
| Task API | `POST /api/plans` | Persist plan and task graph |
| Task API | `GET /api/plans/:id` | Fetch one plan with tasks |
| Task API | `PATCH /api/tasks/:id` | Update mutable task fields |
| Task API | `DELETE /api/plans/:id` | Delete one plan and related tasks |

## Service Guides

- [AI Service Guide](ai-service/README.md)
- [Task API Guide](task-api/README.md)
- [Frontend Guide](frontend/README.md)

## Troubleshooting

- If Python imports fail, run commands with `ai-service/venv/Scripts/python.exe`.
- If plan persistence falls back locally, verify Task API on `http://localhost:4000`.
- If the frontend looks stale, restart Next.js and hard refresh the browser.
