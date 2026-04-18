# Task API - Multi-Agent Planner

Task API is an Express + TypeScript service that persists plans and tasks in SQLite and exposes REST endpoints for plan lifecycle and task updates.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                    Task API (localhost:4000)                    │
│                                                                  │
│  /api/plans                                                      │
│   ├─ POST   create plan + tasks (transaction)                    │
│   ├─ GET    fetch plan + tasks                                   │
│   └─ DELETE delete plan + cascade tasks                          │
│                                                                  │
│  /api/tasks/:id                                                   │
│   └─ PATCH update mutable task fields                            │
│                                                                  │
│  Persistence                                                      │
│   └─ SQLite planner.db (WAL mode + foreign keys ON)              │
└──────────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/plans` | Persist generated/reviewed plan |
| `GET` | `/api/plans/:id` | Retrieve one plan with tasks |
| `DELETE` | `/api/plans/:id` | Delete a plan and all tasks |
| `PATCH` | `/api/tasks/:id` | Update task status/details |
| `GET` | `/health` | Service health check |

## PATCH /api/tasks/:id Fields

Accepted mutable fields:

- `task_id`
- `title`
- `description`
- `estimated_hours`
- `priority`
- `status`
- `dependencies`
- `recommended_date`

## Environment Variables

Create local env file:

```powershell
Copy-Item .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API port (default: 4000) |
| `DB_PATH` | No | SQLite file path (default: ./data/planner.db) |

## Setup & Run

From repository root:

```powershell
npm install --prefix task-api
npm run dev --prefix task-api
```

Build + start production mode:

```powershell
npm run build --prefix task-api
npm run start --prefix task-api
```

## Example Requests

Create a plan:

```bash
curl -X POST http://localhost:4000/api/plans \
  -H "Content-Type: application/json" \
  -d '{"goal":"Goal: Ship MVP","tasks":[{"task_id":"T1","title":"Scope MVP"}]}'
```

Update task status:

```bash
curl -X PATCH http://localhost:4000/api/tasks/<task_id> \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

## Key Files

- `src/index.ts`: app bootstrap + middleware + route registration.
- `src/controllers/`: request validation and response formatting.
- `src/db/`: SQLite connection, schema, and repository layer.
- `src/types/index.ts`: shared API/data types.
