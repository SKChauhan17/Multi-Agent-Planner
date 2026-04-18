# Task API - Multi-Agent Planner

Task API is the persistence backbone: it stores plans, enforces task update contracts, and serves plan/task state over REST.

## Request Flow (Clean ASCII)

```text
┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
│ Client / AI Layer │ ---> │ Express Routes    │ ---> │ Controllers       │
└───────────────────┘      └─────────┬─────────┘      └─────────┬─────────┘
                                      │                          │
                                      ▼                          ▼
                              ┌───────────────────┐      ┌───────────────────┐
                              │ Repository Layer  │ ---> │ SQLite planner.db │
                              │ transaction-safe  │ <--- │ WAL + FKs enabled │
                              └───────────────────┘      └───────────────────┘
```

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/plans` | Persist generated or reviewed plan |
| `GET` | `/api/plans/:id` | Retrieve one plan with task graph |
| `DELETE` | `/api/plans/:id` | Delete one plan and cascade tasks |
| `PATCH` | `/api/tasks/:id` | Update mutable task fields |
| `GET` | `/health` | Health check |

## PATCH /api/tasks/:id Accepted Fields

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
| `PORT` | No | API port, default `4000` |
| `DB_PATH` | No | SQLite file path, default `./data/planner.db` |

## Setup & Run

From repository root:

```powershell
npm install --prefix task-api
npm run dev --prefix task-api
```

Production mode:

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

Update a task:

```bash
curl -X PATCH http://localhost:4000/api/tasks/<task_id> \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

## Key Files

- `src/index.ts`: server bootstrap and middleware wiring.
- `src/controllers/`: validation and response shaping.
- `src/db/`: schema, migrations, and repository logic.
- `src/types/index.ts`: shared API contracts.
