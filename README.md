# Multi-Agent Planner

Multi-Agent Planner is a production-style monorepo that converts a high-level goal into an executable task roadmap, critiques the roadmap with a reviewer agent, and persists workflow progress in SQLite.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Quick Start](#quick-start)
- [Service Documentation](#service-documentation)
- [API Surface](#api-surface)
- [Troubleshooting](#troubleshooting)

## System Overview

The platform has three independently runnable services:

- **Frontend**: Next.js UI for goal input, task editing, reviewer reruns, and standup summaries.
- **AI Service**: FastAPI orchestration layer coordinating Planner + Reviewer agents.
- **Task API**: Express + SQLite persistence layer for plans and task lifecycle updates.

## Architecture

```text
                  ┌───────────────────────────────────┐
                  │           Frontend (3000)         │
                  │      Next.js 16 + React 19        │
                  └───────────────┬───────────────────┘
                          │
            POST /generate-plan   │   PATCH /api/tasks/:id
            POST /re-review-plan  │   GET|POST|DELETE /api/plans
            POST /daily-standup   │
                          │
         ┌────────────────────────────▼──────────────────────────┐
         │                    AI Service (8000)                  │
         │  FastAPI: planner/reviewer orchestration + fallback   │
         └────────────────────────────┬──────────────────────────┘
                          │ POST /api/plans
                          │
         ┌────────────────────────────▼──────────────────────────┐
         │                    Task API (4000)                    │
         │   Express + TypeScript + SQLite transaction layer     │
         └────────────────────────────┬──────────────────────────┘
                          │
                          ▼
                      planner.db (SQLite)
```

## Repository Layout

```text
multi-agent-planner/
├── ai-service/   # FastAPI + planner/reviewer agents
├── task-api/     # Express + SQLite persistence API
├── frontend/     # Next.js application
├── DESIGN.md     # UI/UX design system notes
└── TODO.md       # requirement completion checklist
```

## Quick Start

### 1) Prerequisites

- Node.js 20+
- Python 3.10+
- npm 10+

### 2) Configure environment files

```powershell
Copy-Item ai-service/.env.example ai-service/.env
Copy-Item task-api/.env.example task-api/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Update values in `ai-service/.env` with your real provider keys.

### 3) Install dependencies

```powershell
# Python environment + packages
python -m venv ai-service/venv
ai-service/venv/Scripts/python.exe -m pip install -r ai-service/requirements.txt

# Node dependencies
npm install --prefix task-api
npm install --prefix frontend
```

### 4) Run all services

Open three terminals at repository root.

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

## Service Documentation

- [AI Service Guide](ai-service/README.md)
- [Task API Guide](task-api/README.md)
- [Frontend Guide](frontend/README.md)

## API Surface

| Service | Endpoint | Purpose |
|---|---|---|
| AI Service | `POST /generate-plan` | Create initial reviewed plan |
| AI Service | `POST /re-review-plan` | Re-review manually edited tasks |
| AI Service | `POST /daily-standup` | Summarize done/in-progress/blocked |
| Task API | `POST /api/plans` | Persist plan + tasks |
| Task API | `GET /api/plans/:id` | Fetch plan with tasks |
| Task API | `PATCH /api/tasks/:id` | Update task fields/status |
| Task API | `DELETE /api/plans/:id` | Delete plan and tasks |

## Troubleshooting

- **Python environment mismatch**: always invoke `ai-service/venv/Scripts/python.exe` explicitly.
- **Task API persistence fallback**: ensure Task API is running on `http://localhost:4000`.
- **Frontend not reflecting style updates**: restart Next.js and hard-refresh browser.
