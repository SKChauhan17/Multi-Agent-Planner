# Frontend - Multi-Agent Planner

This app is the user-facing planning studio built with Next.js 16 and React 19.
It handles goal input, plan generation, manual task editing, reviewer reruns, daily standup summaries, and in-session plan history.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Next.js App (localhost:3000)                 │
│                                                                      │
│  Goal + Constraints UI  ──┐                                          │
│  Task Cards + Editors     ├──► Axios Client ──► AI Service (8000)   │
│  Reviewer/Standup Panels  ┘                └──► Task API (4000/api) │
│                                                                      │
│  Local State Slices:                                                 │
│  - plan result                                                       │
│  - agent step trace                                                  │
│  - standup snapshot                                                  │
│  - plan history (session)                                            │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Features

- Goal brief with optional deadline and priority inputs.
- Live generation phases: planning, reviewing, finalizing.
- Editable task cards with persistence for saved tasks.
- Re-run reviewer agent on manually edited plans.
- Daily standup mode (done / in-progress / blocked).
- Session plan history snapshots with one-click restore.
- PDF export via print-friendly layout.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Framer Motion
- Lucide Icons
- Tailwind CSS
- Axios

## Environment Variables

Copy and configure:

```powershell
Copy-Item .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_AI_SERVICE_URL` | Yes | Base URL for FastAPI service |
| `NEXT_PUBLIC_TASK_API_URL` | Yes | Base URL for Task API including `/api` |

## Setup & Run

From repository root:

```powershell
npm install --prefix frontend
npm run dev --prefix frontend
```

Open http://localhost:3000.

## Build Commands

```powershell
npm run build --prefix frontend
npm run start --prefix frontend
```

## Important Files

- `src/app/page.tsx`: main planner workflow and UI state orchestration.
- `src/app/globals.css`: design tokens, selectors, print safety.
- `.env.example`: client runtime endpoint config.

## Integration Notes

- AI endpoints consumed:
	- `POST /generate-plan`
	- `POST /re-review-plan`
	- `POST /daily-standup`
- Task API endpoint consumed:
	- `PATCH /api/tasks/:id`
