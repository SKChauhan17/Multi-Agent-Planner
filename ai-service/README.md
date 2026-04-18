# AI Service - Multi-Agent Planner

The AI Service is a FastAPI orchestration layer that runs planner/reviewer agents, normalizes outputs, and persists plans through the Task API.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FastAPI (localhost:8000)                         │
│                                                                             │
│  POST /generate-plan                                                        │
│   ├─ Planner Agent (model fallback chain)                                   │
│   ├─ Reviewer Agent (critique + revision)                                   │
│   ├─ Task normalization (shape, priority, status, dates)                    │
│   ├─ Task count guardrail (min 5, max 10)                                   │
│   └─ Persist to Task API (/api/plans)                                       │
│                                                                             │
│  POST /re-review-plan                                                       │
│   ├─ Accept manually edited tasks                                            │
│   ├─ Re-run reviewer                                                         │
│   └─ Preserve runtime fields + persist revised plan                          │
│                                                                             │
│  POST /daily-standup                                                        │
│   └─ Summarize done / in-progress / blocked from current task graph         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/generate-plan` | Generate and review initial plan |
| `POST` | `/re-review-plan` | Re-review a manually edited task set |
| `POST` | `/daily-standup` | Summarize execution progress and blockers |

## Environment Variables

Create local env file:

```powershell
Copy-Item .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key for primary model chain |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for fallback chain |
| `OPENROUTER_SITE_URL` | No | Referer header sent to OpenRouter |
| `OPENROUTER_APP_NAME` | No | App name header sent to OpenRouter |

## Setup & Run

From repository root:

```powershell
python -m venv ai-service/venv
ai-service/venv/Scripts/python.exe -m pip install -r ai-service/requirements.txt
cd ai-service
venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Health check:

```powershell
curl http://localhost:8000/docs
```

## Data Contracts

Primary task schema emitted downstream:

- `task_id`
- `title`
- `description`
- `estimated_hours`
- `priority`
- `status`
- `dependencies`
- `recommended_date`

## Failure Behavior

- If planner/reviewer output is malformed, service normalizes and fills safe defaults.
- If Task API is unavailable, service returns a local fallback response instead of failing hard.

## Key Files

- `main.py`: endpoint handlers + normalization + persistence bridge.
- `agents/planner.py`: planning prompts and model fallback.
- `agents/reviewer.py`: review prompts and model fallback.
- `.env.example`: required configuration template.
