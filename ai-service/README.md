<p align="center">
  <img src="../.github/assets/readme-ai-hero.svg" alt="AI Service Hero" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-Orchestration-141413?style=for-the-badge" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Planner+Reviewer-Enabled-f5f4ed?style=for-the-badge&labelColor=141413&color=e8e6dc" alt="Planner Reviewer" />
  <img src="https://img.shields.io/badge/Fallback-Groq+OpenRouter-f5f4ed?style=for-the-badge&labelColor=141413&color=e8e6dc" alt="Fallback" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#processing-pipeline-clean-ascii">Pipeline</a> ·
  <a href="#endpoints">Endpoints</a> ·
  <a href="#output-contract">Output Contract</a>
</p>

---

The AI Service is the orchestration engine of the platform: it plans, critiques, normalizes, and forwards final plans for storage.

## Service Snapshot

| Stage | Responsibility | Output |
|---|---|---|
| Plan | Build initial task graph from goal | candidate task list |
| Review | Critique realism and missing steps | revised task list + summary |
| Normalize | Apply guardrails and schema safety | stable payload |
| Persist | Send final plan to Task API | durable plan record |

## Active Model Chain (Quality + Low Latency)

Planner and reviewer agent calls use the same fallback chain, in this exact order:

1. `groq` -> `llama-3.3-70b-versatile`
2. `groq` -> `openai/gpt-oss-120b`
3. `groq` -> `qwen/qwen3-32b`
4. `groq` -> `llama-3.1-8b-instant`
5. `openrouter` -> `openai/gpt-oss-120b:free`
6. `openrouter` -> `meta-llama/llama-3.3-70b-instruct:free`
7. `openrouter` -> `qwen/qwen3-next-80b-a3b-instruct:free`
8. `openrouter` -> `google/gemma-4-31b-it:free`
9. `openrouter` -> `openai/gpt-oss-20b:free`

Why this chain is practical:

- Groq-first routing keeps first-attempt latency low.
- Cross-provider fallback improves reliability under model/provider outages.
- Responses are forced into strict JSON and validated before they enter the task pipeline.

## Processing Pipeline (Clean ASCII)

```text
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ Goal Input    │ ---> │ Planner Agent │ ---> │ Reviewer Agent│
└───────────────┘      └───────┬───────┘      └───────┬───────┘
                                fallback chain          revised tasks
                                        \               /
                                         \             /
                                          ▼           ▼
                                  ┌──────────────────────────┐
                                  │ Normalization Layer      │
                                  │ - schema safety          │
                                  │ - task count guardrail   │
                                  │ - recommended date fill  │
                                  └────────────┬─────────────┘
                                               │
                                               ▼
                                  POST /api/plans (Task API)
```

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/generate-plan` | Generate and review an initial plan |
| `POST` | `/re-review-plan` | Re-review manually edited tasks |
| `POST` | `/daily-standup` | Summarize done, in-progress, and blocked work |
| `PATCH` | `/update-task/:id` | Proxy mutable task updates to Task API |

## Environment Variables

Create local env file:

```powershell
Copy-Item .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Primary provider key |
| `OPENROUTER_API_KEY` | Yes | Fallback provider key |
| `OPENROUTER_SITE_URL` | No | OpenRouter referer metadata |
| `OPENROUTER_APP_NAME` | No | OpenRouter app-name metadata |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS allowlist for browser callers |
| `TASK_API_BASE_URL` | No | Base URL for Task API, default `http://localhost:4000` |
| `TASK_API_INTERNAL_TOKEN` | Yes (prod) | Shared token forwarded to Task API |
| `TASK_API_TIMEOUT_SECONDS` | No | Task API request timeout in seconds |
| `RATE_LIMIT_WINDOW_SECONDS` | No | Rate-limit window for in-memory limiter |
| `RATE_LIMIT_MAX_REQUESTS` | No | Max requests per IP+endpoint per window |

## Quick Start

From repository root:

```powershell
python -m venv ai-service/venv
ai-service/venv/Scripts/python.exe -m pip install -r ai-service/requirements.txt
cd ai-service
venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Open docs at http://localhost:8000/docs.

## Output Contract

Each task emitted downstream includes:

- `task_id`
- `title`
- `description`
- `estimated_hours`
- `priority`
- `status`
- `dependencies`
- `recommended_date`

## Reliability Notes

- If model output is malformed, the service normalizes or fills safe defaults.
- If Task API persistence fails, the service returns a local fallback plan response.

## Key Files

- `main.py`: endpoints, normalization rules, and persistence bridge.
- `agents/planner.py`: planner prompts and provider fallback logic.
- `agents/reviewer.py`: reviewer prompts and provider fallback logic.
- `.env.example`: configuration template.
