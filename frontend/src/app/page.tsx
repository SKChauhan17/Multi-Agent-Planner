"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion, Variants } from "framer-motion";
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  Clock3,
  Download,
  History,
  Hourglass,
  Loader2,
  Pencil,
  RefreshCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type TaskPriority = "High" | "Medium" | "Low";
type TaskStatus = "todo" | "in-progress" | "done";

interface TaskRow {
  id: string;
  task_id: string;
  title: string;
  description: string;
  estimated_hours: number;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: string[];
  recommended_date: string;
}

interface PlanResponse {
  review_summary: string;
  final_plan: {
    id: string;
    goal: string;
    tasks: TaskRow[];
  };
}

interface DailyStandupResponse {
  standup_summary: string;
  done: string[];
  in_progress: string[];
  blocked: string[];
}

interface PlanHistoryItem {
  id: string;
  label: string;
  created_at: string;
  goal_preview: string;
  result: PlanResponse;
}

interface TaskDraft {
  task_id: string;
  title: string;
  description: string;
  estimated_hours: string;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: string;
  recommended_date: string;
}

interface AgentTraceEntry {
  id: string;
  step: string;
  detail: string;
  state: "working" | "done" | "error";
  at: string;
}

type LoadingPhase = "none" | "planning" | "reviewing" | "finalizing";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
};

const statusLabelMap: Record<TaskStatus, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateLabel(value: string): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeDependencies(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
      }
    } catch {
      // fallback to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function normalizeTask(task: unknown, index: number): TaskRow {
  const source = typeof task === "object" && task !== null ? (task as Record<string, unknown>) : {};

  const taskId = typeof source.task_id === "string" && source.task_id.trim().length > 0
    ? source.task_id.trim()
    : `T${index + 1}`;

  const id = typeof source.id === "string" && source.id.trim().length > 0
    ? source.id.trim()
    : createClientId("local");

  const title = typeof source.title === "string" && source.title.trim().length > 0
    ? source.title.trim()
    : `Task ${index + 1}`;

  const description = typeof source.description === "string" && source.description.trim().length > 0
    ? source.description.trim()
    : `Complete ${title.toLowerCase()}.`;

  const estimatedRaw = Number(source.estimated_hours);
  const estimatedHours = Number.isFinite(estimatedRaw) ? Math.max(0, Math.round(estimatedRaw)) : 1;

  const priorityCandidate = String(source.priority ?? "Medium").trim() as TaskPriority;
  const priority: TaskPriority = ["High", "Medium", "Low"].includes(priorityCandidate)
    ? priorityCandidate
    : "Medium";

  const statusCandidate = String(source.status ?? "todo").trim() as TaskStatus;
  const status: TaskStatus = ["todo", "in-progress", "done"].includes(statusCandidate)
    ? statusCandidate
    : "todo";

  const recommendedDate = typeof source.recommended_date === "string" ? source.recommended_date.trim() : "";

  return {
    id,
    task_id: taskId,
    title,
    description,
    estimated_hours: estimatedHours,
    priority,
    status,
    dependencies: normalizeDependencies(source.dependencies),
    recommended_date: recommendedDate,
  };
}

function normalizePlanResponse(payload: unknown): PlanResponse {
  const source = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const finalPlanRaw =
    typeof source.final_plan === "object" && source.final_plan !== null
      ? (source.final_plan as Record<string, unknown>)
      : {};

  const rawTasks = Array.isArray(finalPlanRaw.tasks) ? finalPlanRaw.tasks : [];
  const normalizedTasks = rawTasks.map((task, index) => normalizeTask(task, index));

  const reviewSummary = typeof source.review_summary === "string" && source.review_summary.trim().length > 0
    ? source.review_summary.trim()
    : "No review summary available.";

  const planId = typeof finalPlanRaw.id === "string" && finalPlanRaw.id.trim().length > 0
    ? finalPlanRaw.id.trim()
    : createClientId("plan");

  const goal = typeof finalPlanRaw.goal === "string" ? finalPlanRaw.goal : "";

  return {
    review_summary: reviewSummary,
    final_plan: {
      id: planId,
      goal,
      tasks: normalizedTasks,
    },
  };
}

function clonePlanResponse(plan: PlanResponse): PlanResponse {
  return normalizePlanResponse(JSON.parse(JSON.stringify(plan)) as unknown);
}

function normalizeStandupResponse(payload: unknown): DailyStandupResponse {
  const source = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0) : [];

  return {
    standup_summary:
      typeof source.standup_summary === "string" && source.standup_summary.trim().length > 0
        ? source.standup_summary.trim()
        : "No standup summary available.",
    done: toStringArray(source.done),
    in_progress: toStringArray(source.in_progress),
    blocked: toStringArray(source.blocked),
  };
}

function parseGoalEnvelope(goalEnvelope: string): {
  goalText: string;
  deadline: string;
  priority: TaskPriority;
} {
  const sections = goalEnvelope.split("|").map((part) => part.trim());
  let goalText = goalEnvelope.trim();
  let deadline = "";
  let priority: TaskPriority = "Medium";

  for (const section of sections) {
    if (section.startsWith("Goal:")) {
      goalText = section.replace("Goal:", "").trim() || goalText;
    }
    if (section.startsWith("Deadline:")) {
      const raw = section.replace("Deadline:", "").trim();
      deadline = raw.toLowerCase() === "none" ? "" : raw;
    }
    if (section.startsWith("Priority:")) {
      const rawPriority = section.replace("Priority:", "").trim() as TaskPriority;
      if (["High", "Medium", "Low"].includes(rawPriority)) {
        priority = rawPriority;
      }
    }
  }

  return {
    goalText,
    deadline,
    priority,
  };
}

export default function Page() {
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [userPriority, setUserPriority] = useState<TaskPriority>("Medium");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("none");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [today, setToday] = useState("");

  const [isRerunningReview, setIsRerunningReview] = useState(false);
  const [isGeneratingStandup, setIsGeneratingStandup] = useState(false);
  const [dailyStandup, setDailyStandup] = useState<DailyStandupResponse | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);

  const [agentTrace, setAgentTrace] = useState<AgentTraceEntry[]>([]);
  const [planHistory, setPlanHistory] = useState<PlanHistoryItem[]>([]);

  const aiServiceUrl = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "http://localhost:8000";

  useEffect(() => {
    const dt = new Date();
    const localDate = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
    setToday(localDate);
  }, []);

  const tasks = useMemo(() => result?.final_plan?.tasks ?? [], [result]);
  const hasResult = Boolean(result);
  const isBusy = loadingPhase !== "none" || isRerunningReview || isGeneratingStandup;

  const visibleTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const aDone = a.status === "done" ? 1 : 0;
        const bDone = b.status === "done" ? 1 : 0;
        return aDone - bDone;
      }),
    [tasks],
  );

  const inProgressCount = tasks.filter((task) => task.status === "in-progress").length;
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const criticalRemainingCount = tasks.filter(
    (task) => task.priority === "High" && task.status !== "done",
  ).length;
  const totalHours = tasks
    .filter((task) => task.status !== "done")
    .reduce((sum, task) => sum + task.estimated_hours, 0);
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const inProgressRate = tasks.length ? Math.round((inProgressCount / tasks.length) * 100) : 0;

  const daysLeft = deadline
    ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const appendTrace = (
    step: string,
    detail: string,
    state: AgentTraceEntry["state"] = "working",
  ) => {
    const timestamp = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setAgentTrace((previous) => [
      ...previous,
      {
        id: createClientId("trace"),
        step,
        detail,
        state,
        at: timestamp,
      },
    ]);
  };

  const syncEnvelopeStateFromGoal = (goalEnvelope: string) => {
    const parsed = parseGoalEnvelope(goalEnvelope);
    setGoal(parsed.goalText);
    setDeadline(parsed.deadline);
    setUserPriority(parsed.priority);
  };

  const recordHistorySnapshot = (snapshot: PlanResponse, label: string) => {
    const normalized = clonePlanResponse(snapshot);
    const parsedGoal = parseGoalEnvelope(normalized.final_plan.goal);
    const historyItem: PlanHistoryItem = {
      id: createClientId("history"),
      label,
      created_at: new Date().toISOString(),
      goal_preview: parsedGoal.goalText,
      result: normalized,
    };

    setPlanHistory((previous) => [historyItem, ...previous].slice(0, 12));
  };

  const handleGenerate = async () => {
    if (!goal.trim()) return;

    setError(null);
    setDailyStandup(null);
    setResult(null);
    setEditingTaskId(null);
    setTaskDraft(null);
    setLoadingPhase("planning");
    setAgentTrace([]);
    appendTrace("Pipeline", "Planner agent started from your latest project brief.", "working");

    const timerOne = window.setTimeout(() => {
      setLoadingPhase("reviewing");
      appendTrace("Planner", "Task draft completed; reviewer critique has started.", "working");
    }, 1100);

    const timerTwo = window.setTimeout(() => {
      setLoadingPhase("finalizing");
      appendTrace("Reviewer", "Reviewer revisions accepted; normalizing and syncing tasks.", "working");
    }, 2200);

    try {
      const finalGoal = `Goal: ${goal} | Deadline: ${deadline || "None"} | Priority: ${userPriority}`;
      const response = await axios.post<PlanResponse>(`${aiServiceUrl}/generate-plan`, {
        goal: finalGoal,
      });

      const normalized = normalizePlanResponse(response.data);
      setResult(normalized);
      recordHistorySnapshot(normalized, "Generated plan");
      appendTrace("Finalize", "Plan is ready with persistence + reviewer summary.", "done");
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        setError(
          requestError.response?.data?.detail ||
            "An unexpected error occurred while contacting the planning services.",
        );
      } else {
        setError(
          (requestError as Error).message ||
            "An unexpected error occurred while contacting the planning services.",
        );
      }
      appendTrace("Error", "Generation failed before a complete plan was returned.", "error");
    } finally {
      window.clearTimeout(timerOne);
      window.clearTimeout(timerTwo);
      setLoadingPhase("none");
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    if (!result) return;

    setResult((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        final_plan: {
          ...previous.final_plan,
          tasks: previous.final_plan.tasks.map((task) =>
            task.id === taskId ? { ...task, status: newStatus } : task,
          ),
        },
      };
    });

    if (taskId.startsWith("local-")) return;

    try {
      const response = await axios.patch(`${aiServiceUrl}/update-task/${taskId}`, {
        status: newStatus,
      });
      const serverTask = normalizeTask(response.data?.data, 0);

      setResult((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          final_plan: {
            ...previous.final_plan,
            tasks: previous.final_plan.tasks.map((task) =>
              task.id === taskId ? { ...task, ...serverTask, id: task.id } : task,
            ),
          },
        };
      });
    } catch (statusError) {
      console.error("Failed to persist task status", statusError);
      appendTrace("Persistence", `Failed to persist status for task ${taskId}.`, "error");
    }
  };

  const startTaskEdit = (task: TaskRow) => {
    setEditingTaskId(task.id);
    setTaskDraft({
      task_id: task.task_id,
      title: task.title,
      description: task.description,
      estimated_hours: String(task.estimated_hours),
      priority: task.priority,
      status: task.status,
      dependencies: task.dependencies.join(", "),
      recommended_date: task.recommended_date,
    });
  };

  const cancelTaskEdit = () => {
    setEditingTaskId(null);
    setTaskDraft(null);
  };

  const handleTaskDraftChange = <K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) => {
    setTaskDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        [field]: value,
      };
    });
  };

  const saveTaskEdit = async () => {
    if (!result || !taskDraft || !editingTaskId) return;

    if (!taskDraft.title.trim()) {
      setError("Task title cannot be empty.");
      return;
    }

    const hours = Number(taskDraft.estimated_hours);
    if (!Number.isFinite(hours) || hours < 0) {
      setError("Estimated hours must be a non-negative number.");
      return;
    }

    const dependencies = taskDraft.dependencies
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const updatedTask: TaskRow = {
      id: editingTaskId,
      task_id: taskDraft.task_id.trim() || "T1",
      title: taskDraft.title.trim(),
      description: taskDraft.description.trim(),
      estimated_hours: Math.round(hours),
      priority: taskDraft.priority,
      status: taskDraft.status,
      dependencies,
      recommended_date: taskDraft.recommended_date.trim(),
    };

    setResult((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        final_plan: {
          ...previous.final_plan,
          tasks: previous.final_plan.tasks.map((task) =>
            task.id === editingTaskId ? updatedTask : task,
          ),
        },
      };
    });

    try {
      if (!editingTaskId.startsWith("local-")) {
        await axios.patch(`${aiServiceUrl}/update-task/${editingTaskId}`, {
          task_id: updatedTask.task_id,
          title: updatedTask.title,
          description: updatedTask.description,
          estimated_hours: updatedTask.estimated_hours,
          priority: updatedTask.priority,
          status: updatedTask.status,
          dependencies: updatedTask.dependencies,
          recommended_date: updatedTask.recommended_date,
        });
      }

      appendTrace("Task Edit", `Saved manual edits for ${updatedTask.task_id}.`, "done");
      setEditingTaskId(null);
      setTaskDraft(null);
      setError(null);
    } catch (saveError) {
      console.error("Failed to persist edited task", saveError);
      setError("Task edits were applied locally, but persistence to the Task API failed.");
      appendTrace("Task Edit", `Task ${updatedTask.task_id} edit persisted locally only.`, "error");
    }
  };

  const handleRerunReviewer = async () => {
    if (!result) return;

    setError(null);
    setDailyStandup(null);
    setIsRerunningReview(true);
    setLoadingPhase("reviewing");
    appendTrace("Reviewer", "Manual edits submitted for reviewer rerun.", "working");

    try {
      const response = await axios.post<PlanResponse>(`${aiServiceUrl}/re-review-plan`, {
        goal: result.final_plan.goal,
        tasks: result.final_plan.tasks,
      });

      const normalized = normalizePlanResponse(response.data);
      setResult(normalized);
      recordHistorySnapshot(normalized, "Reviewer rerun");
      syncEnvelopeStateFromGoal(normalized.final_plan.goal);
      appendTrace("Reviewer", "Revised plan received from reviewer rerun.", "done");
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        setError(
          requestError.response?.data?.detail ||
            "Reviewer rerun failed while contacting the AI service.",
        );
      } else {
        setError((requestError as Error).message || "Reviewer rerun failed.");
      }
      appendTrace("Reviewer", "Reviewer rerun failed.", "error");
    } finally {
      setLoadingPhase("none");
      setIsRerunningReview(false);
    }
  };

  const handleGenerateStandup = async () => {
    if (!result) return;

    setError(null);
    setIsGeneratingStandup(true);
    appendTrace("Standup", "Generating daily standup summary for current task graph.", "working");

    try {
      const response = await axios.post(`${aiServiceUrl}/daily-standup`, {
        goal: result.final_plan.goal,
        tasks: result.final_plan.tasks,
      });

      const normalized = normalizeStandupResponse(response.data);
      setDailyStandup(normalized);
      appendTrace("Standup", "Standup summary is ready.", "done");
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        setError(
          requestError.response?.data?.detail ||
            "Daily standup generation failed while contacting the AI service.",
        );
      } else {
        setError((requestError as Error).message || "Daily standup generation failed.");
      }
      appendTrace("Standup", "Standup generation failed.", "error");
    } finally {
      setIsGeneratingStandup(false);
    }
  };

  const handleLoadHistorySnapshot = (item: PlanHistoryItem) => {
    const snapshot = clonePlanResponse(item.result);
    setResult(snapshot);
    syncEnvelopeStateFromGoal(snapshot.final_plan.goal);
    setDailyStandup(null);
    setError(null);
    setEditingTaskId(null);
    setTaskDraft(null);
    appendTrace("History", `Loaded snapshot from ${formatDateTimeLabel(item.created_at)}.`, "done");
  };

  const handleReset = () => {
    setGoal("");
    setDeadline("");
    setUserPriority("Medium");
    setError(null);
    setResult(null);
    setLoadingPhase("none");
    setDailyStandup(null);
    setEditingTaskId(null);
    setTaskDraft(null);
    appendTrace("Reset", "Cleared active plan from workspace view.", "done");
  };

  const handleExportPDF = () => {
    window.print();
  };

  const traceStatusClass = (state: AgentTraceEntry["state"]): string => {
    if (state === "done") return "bg-[#4f8a5b]";
    if (state === "error") return "bg-[#b53333]";
    return "bg-[#d97757]";
  };

  return (
    <div className="min-h-screen bg-[#f5f4ed] text-[#141413]">
      <header className="sticky top-0 z-20 border-b border-[#e8e6dc] bg-[#f5f4ed]/95 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="label-caps text-[#87867f]">Multi-Agent Planner</p>
            <h1 className="editorial-title text-2xl leading-tight text-[#141413]">Planning Studio</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasResult && (
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e8e6dc] bg-[#e8e6dc] px-4 py-2 text-sm font-semibold text-[#4d4c48] transition hover:bg-[#dfddd1] warm-ring"
              >
                <RefreshCcw className="h-4 w-4" />
                Reset
              </button>
            )}

            {hasResult && (
              <button
                onClick={handleRerunReviewer}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e8e6dc] bg-[#faf9f5] px-4 py-2 text-sm font-semibold text-[#4d4c48] transition hover:bg-[#f2f0e8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRerunningReview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Re-run Reviewer
              </button>
            )}

            {hasResult && (
              <button
                onClick={handleGenerateStandup}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e8e6dc] bg-[#faf9f5] px-4 py-2 text-sm font-semibold text-[#4d4c48] transition hover:bg-[#f2f0e8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingStandup ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
                Daily Standup
              </button>
            )}

            {hasResult && (
              <button
                onClick={handleExportPDF}
                className="inline-flex items-center gap-2 rounded-xl border border-[#c96442] bg-[#c96442] px-4 py-2 text-sm font-semibold text-[#faf9f5] transition hover:bg-[#b65b3c]"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="print-safe-grid grid gap-6 print:block print:space-y-4 lg:grid-cols-[1.25fr_0.75fr]">
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface-card print-safe-motion rounded-[2rem] border border-[#f0eee6] bg-[#faf9f5] p-6 whisper-shadow print-card sm:p-8"
          >
            <div className="mb-6">
              <p className="label-caps text-[#87867f]">Project Brief</p>
              <h2 className="editorial-title mt-2 text-4xl leading-[1.1] text-[#141413] sm:text-5xl">
                Architect the roadmap.
              </h2>
              <p className="mt-3 max-w-2xl text-[17px] text-[#5e5d59]">
                Describe the mission and tune planning constraints. Planner and reviewer agents will produce a sequenced plan, then you can manually edit tasks, rerun review, and generate daily standups.
              </p>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="label-caps text-[#5e5d59]">Goal</span>
                <textarea
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  rows={4}
                  disabled={isBusy}
                  placeholder="Launch a productized personal finance dashboard for students by August with onboarding, budget tracking, and analytics."
                  className="mt-2 w-full resize-none rounded-2xl border border-[#e8e6dc] bg-[#f5f4ed] px-4 py-3 text-[16px] text-[#141413] placeholder:text-[#87867f] shadow-[0_0_0_1px_#d1cfc5] outline-none transition focus:border-[#3898ec] focus:ring-2 focus:ring-[#3898ec]/30"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label-caps text-[#5e5d59]">Priority</span>
                  <div className="relative mt-2">
                    <select
                      value={userPriority}
                      onChange={(event) => setUserPriority(event.target.value as TaskPriority)}
                      disabled={isBusy}
                      className="planner-select"
                    >
                      <option value="High">High Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="Low">Low Priority</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#87867f]" />
                  </div>
                </label>

                <label className="block">
                  <span className="label-caps text-[#5e5d59]">Deadline</span>
                  <div className="mt-2">
                    <input
                      type="date"
                      value={deadline}
                      min={today}
                      onChange={(event) => setDeadline(event.target.value)}
                      disabled={isBusy}
                      className="planner-select planner-date-input"
                    />
                  </div>
                </label>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  onClick={handleGenerate}
                  disabled={!goal.trim() || isBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#c96442] bg-[#c96442] px-5 py-2.5 text-sm font-semibold text-[#faf9f5] transition hover:bg-[#b65b3c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingPhase === "none" ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {loadingPhase === "none" ? "Generate Plan" : "Synthesizing"}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {loadingPhase !== "none" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5 overflow-hidden rounded-xl border border-[#e8e6dc] bg-[#f5f4ed] px-4 py-3 text-sm font-semibold text-[#5e5d59]"
                >
                  {loadingPhase === "planning" && "Planner agent is structuring milestones..."}
                  {loadingPhase === "reviewing" && "Reviewer agent is stress-testing sequencing..."}
                  {loadingPhase === "finalizing" && "Final plan is being normalized for delivery..."}
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="mt-5 rounded-xl border border-[#f0d6d1] bg-[#fff3f1] px-4 py-3 text-sm text-[#b53333]">
                <p className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </p>
              </div>
            )}
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="surface-card print-safe-motion rounded-[2rem] border border-[#30302e] bg-[#141413] p-6 text-[#faf9f5] whisper-shadow print-card sm:p-8"
          >
            <p className="label-caps text-[#b0aea5]">Planning Snapshot</p>
            <h3 className="editorial-title mt-2 text-3xl leading-[1.2]">Execution context</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-xl border border-[#30302e] bg-[#1c1c1a] px-4 py-3">
                <p className="label-caps text-[#b0aea5]">Priority</p>
                <p className="mt-1 text-base font-semibold text-[#faf9f5]">{userPriority}</p>
              </div>
              <div className="rounded-xl border border-[#30302e] bg-[#1c1c1a] px-4 py-3">
                <p className="label-caps text-[#b0aea5]">Deadline</p>
                <p className="mt-1 text-base font-semibold text-[#faf9f5]">
                  {deadline ? formatDateLabel(deadline) : "No fixed deadline"}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-[#30302e] bg-[#1c1c1a] px-4 py-4">
              <p className="label-caps text-[#b0aea5]">Reviewer Summary</p>
              <p className="mt-2 text-[15px] leading-7 text-[#e8e6dc]">
                {hasResult
                  ? result?.review_summary
                  : "Once generated, this panel shows the reviewer agent critique and the refined execution narrative in concise form."}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-[#30302e] bg-[#1c1c1a] px-4 py-4">
              <p className="label-caps text-[#b0aea5]">Agent Step Trace</p>
              {agentTrace.length === 0 ? (
                <p className="mt-2 text-sm text-[#b0aea5]">
                  Step-by-step agent activity appears here during generation, reruns, edits, and standup mode.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {agentTrace.slice(-8).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg border border-[#30302e] bg-[#141413] px-3 py-2"
                    >
                      <span className={cn("mt-1.5 h-2 w-2 rounded-full", traceStatusClass(entry.state))} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#e8e6dc]">
                          {entry.step}
                        </p>
                        <p className="text-sm text-[#b0aea5]">{entry.detail}</p>
                      </div>
                      <span className="text-[11px] text-[#87867f]">{entry.at}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.article>
        </section>

        <section className="hidden border-b border-[#e8e6dc] pb-4 print:block">
          <h2 className="editorial-title text-2xl">Project Parameters</h2>
          <p className="mt-2 text-[16px] text-[#4d4c48]">Goal: {goal || "Not set"}</p>
          <p className="text-[16px] text-[#4d4c48]">Priority: {userPriority}</p>
          <p className="text-[16px] text-[#4d4c48]">
            Deadline: {deadline ? formatDateLabel(deadline) : "No fixed deadline"}
          </p>
        </section>

        <AnimatePresence>
          {hasResult && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-8"
            >
              <div className="print-safe-grid grid grid-cols-1 gap-4 print:block print:space-y-3 md:grid-cols-2">
                <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card">
                  <p className="label-caps text-[#87867f]">Total Load</p>
                  <p className="mt-1 text-3xl font-semibold text-[#141413]">{totalHours}h</p>
                </article>

                <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card">
                  <p className="label-caps text-[#87867f]">In Progress</p>
                  <p className="mt-1 text-3xl font-semibold text-[#141413]">{inProgressCount}</p>
                </article>

                <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card">
                  <p className="label-caps text-[#87867f]">Time Left</p>
                  <p className="mt-1 text-3xl font-semibold text-[#141413]">
                    {daysLeft === null ? "Flexible" : `${daysLeft} days`}
                  </p>
                </article>

                <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card">
                  <p className="label-caps text-[#87867f]">Critical Remaining</p>
                  <p className="mt-1 text-3xl font-semibold text-[#141413]">{criticalRemainingCount}</p>
                </article>

                <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card md:col-span-2">
                  <p className="label-caps text-[#87867f]">Progress</p>
                  <div className="mt-2 flex items-end justify-between">
                    <p className="text-3xl font-semibold text-[#141413]">{completionRate}%</p>
                    <p className="text-sm font-semibold text-[#5e5d59]">
                      In Progress {inProgressRate}% • Done {completionRate}%
                    </p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e8e6dc] print:hidden">
                    <div className="flex h-full">
                      <motion.div
                        className="h-full bg-[#d97757]"
                        initial={{ width: 0 }}
                        animate={{ width: `${inProgressRate}%` }}
                        transition={{ duration: 0.5 }}
                      />
                      <motion.div
                        className="h-full bg-[#4f8a5b]"
                        initial={{ width: 0 }}
                        animate={{ width: `${completionRate}%` }}
                        transition={{ duration: 0.5, delay: 0.05 }}
                      />
                    </div>
                  </div>
                </article>
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-4"
              >
                {visibleTasks.map((task) => {
                  const isDone = task.status === "done";
                  const isEditing = editingTaskId === task.id && Boolean(taskDraft);

                  return (
                    <motion.article
                      key={task.id}
                      variants={itemVariants}
                      className={cn(
                        "surface-card print-safe-motion rounded-[1.5rem] border bg-[#faf9f5] p-6 whisper-shadow print-card",
                        isDone ? "border-[#d3e5d7]" : "border-[#f0eee6]",
                      )}
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="relative print:hidden">
                            <select
                              value={task.status}
                              onChange={(event) =>
                                handleStatusChange(task.id, event.target.value as TaskStatus)
                              }
                              className={cn(
                                "planner-select planner-select-sm",
                                task.status === "todo" &&
                                  "border-[#e8e6dc] bg-[#f5f4ed] text-[#5e5d59]",
                                task.status === "in-progress" &&
                                  "border-[#f0d8cf] bg-[#fff4ef] text-[#a35237]",
                                task.status === "done" &&
                                  "border-[#d3e5d7] bg-[#edf7ef] text-[#3d6b46]",
                              )}
                            >
                              <option value="todo">To Do</option>
                              <option value="in-progress">In Progress</option>
                              <option value="done">Done</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#87867f]" />
                          </div>

                          <span className="hidden rounded-full border border-[#e8e6dc] bg-[#f5f4ed] px-3 py-1 text-xs font-semibold text-[#5e5d59] print:inline-flex">
                            {statusLabelMap[task.status]}
                          </span>

                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => startTaskEdit(task)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#e8e6dc] bg-[#f5f4ed] px-2.5 py-1.5 text-xs font-semibold text-[#5e5d59] transition hover:bg-[#efede4] disabled:cursor-not-allowed disabled:opacity-60 print:hidden"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          )}
                        </div>

                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
                            task.priority === "High" &&
                              "border-[#f0d6d1] bg-[#fff3f1] text-[#b53333]",
                            task.priority === "Medium" &&
                              "border-[#efdfc4] bg-[#fdf7ec] text-[#a06d28]",
                            task.priority === "Low" &&
                              "border-[#d7e3ef] bg-[#f1f6fb] text-[#44658a]",
                          )}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {isEditing && taskDraft ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="label-caps text-[#87867f]">Task ID</span>
                              <input
                                value={taskDraft.task_id}
                                onChange={(event) => handleTaskDraftChange("task_id", event.target.value)}
                                className="planner-select mt-1"
                              />
                            </label>

                            <label className="block">
                              <span className="label-caps text-[#87867f]">Priority</span>
                              <div className="relative mt-1">
                                <select
                                  value={taskDraft.priority}
                                  onChange={(event) =>
                                    handleTaskDraftChange("priority", event.target.value as TaskPriority)
                                  }
                                  className="planner-select"
                                >
                                  <option value="High">High</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Low">Low</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#87867f]" />
                              </div>
                            </label>
                          </div>

                          <label className="block">
                            <span className="label-caps text-[#87867f]">Title</span>
                            <input
                              value={taskDraft.title}
                              onChange={(event) => handleTaskDraftChange("title", event.target.value)}
                              className="planner-select mt-1"
                            />
                          </label>

                          <label className="block">
                            <span className="label-caps text-[#87867f]">Description</span>
                            <textarea
                              value={taskDraft.description}
                              onChange={(event) => handleTaskDraftChange("description", event.target.value)}
                              rows={3}
                              className="planner-select mt-1 resize-none"
                            />
                          </label>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="block">
                              <span className="label-caps text-[#87867f]">Hours</span>
                              <input
                                type="number"
                                min={0}
                                value={taskDraft.estimated_hours}
                                onChange={(event) =>
                                  handleTaskDraftChange("estimated_hours", event.target.value)
                                }
                                className="planner-select mt-1"
                              />
                            </label>

                            <label className="block">
                              <span className="label-caps text-[#87867f]">Status</span>
                              <div className="relative mt-1">
                                <select
                                  value={taskDraft.status}
                                  onChange={(event) =>
                                    handleTaskDraftChange("status", event.target.value as TaskStatus)
                                  }
                                  className="planner-select"
                                >
                                  <option value="todo">To Do</option>
                                  <option value="in-progress">In Progress</option>
                                  <option value="done">Done</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#87867f]" />
                              </div>
                            </label>

                            <label className="block">
                              <span className="label-caps text-[#87867f]">Recommended Date</span>
                              <input
                                type="date"
                                value={taskDraft.recommended_date}
                                onChange={(event) =>
                                  handleTaskDraftChange("recommended_date", event.target.value)
                                }
                                className="planner-select planner-date-input mt-1"
                              />
                            </label>
                          </div>

                          <label className="block">
                            <span className="label-caps text-[#87867f]">Dependencies (comma-separated task IDs)</span>
                            <input
                              value={taskDraft.dependencies}
                              onChange={(event) =>
                                handleTaskDraftChange("dependencies", event.target.value)
                              }
                              className="planner-select mt-1"
                              placeholder="T1, T2"
                            />
                          </label>

                          <div className="flex flex-wrap gap-2 pt-1 print:hidden">
                            <button
                              onClick={saveTaskEdit}
                              className="inline-flex items-center gap-2 rounded-lg border border-[#c96442] bg-[#c96442] px-3 py-2 text-xs font-semibold text-[#faf9f5] transition hover:bg-[#b65b3c]"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save Task
                            </button>
                            <button
                              onClick={cancelTaskEdit}
                              className="inline-flex items-center gap-2 rounded-lg border border-[#e8e6dc] bg-[#f5f4ed] px-3 py-2 text-xs font-semibold text-[#5e5d59] transition hover:bg-[#efede4]"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3
                            className={cn(
                              "editorial-title flex items-center gap-3 text-[30px] leading-[1.2]",
                              isDone && "text-[#5f7f66] line-through decoration-[#8ab596]",
                            )}
                          >
                            <span className="text-sm font-semibold uppercase tracking-wide text-[#87867f]">
                              {task.task_id}
                            </span>
                            <span>{task.title}</span>
                          </h3>

                          <p className="mt-2 text-[16px] leading-7 text-[#5e5d59]">{task.description}</p>

                          {task.dependencies.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                              {task.dependencies.map((dependency) => (
                                <span
                                  key={`${task.id}-${dependency}`}
                                  className="rounded-full border border-[#e8e6dc] bg-[#f5f4ed] px-3 py-1 text-xs font-semibold text-[#5e5d59]"
                                >
                                  Requires {dependency}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-5 grid gap-3 border-t border-[#f0eee6] pt-4 text-sm text-[#5e5d59] sm:grid-cols-2">
                            <p className="inline-flex items-center gap-2 font-semibold">
                              <Hourglass className="h-4 w-4" />
                              {task.estimated_hours} hours
                            </p>
                            <p className="inline-flex items-center gap-2 font-semibold">
                              <CalendarClock className="h-4 w-4" />
                              {task.recommended_date
                                ? formatDateLabel(task.recommended_date)
                                : "No suggested date"}
                            </p>
                          </div>
                        </>
                      )}
                    </motion.article>
                  );
                })}
              </motion.div>

              <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card">
                <p className="label-caps text-[#87867f]">Reviewer Critique</p>
                <p className="mt-2 text-[16px] leading-7 text-[#5e5d59]">
                  {result?.review_summary || "No review summary available."}
                </p>
              </article>

              {dailyStandup && (
                <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print-card">
                  <p className="label-caps text-[#87867f]">Daily Standup Mode</p>
                  <p className="mt-2 text-[16px] leading-7 text-[#5e5d59]">
                    {dailyStandup.standup_summary}
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-3 print:block print:space-y-3">
                    <div className="rounded-xl border border-[#d3e5d7] bg-[#edf7ef] p-3">
                      <p className="label-caps text-[#3d6b46]">Done</p>
                      <p className="mt-1 text-sm text-[#3d6b46]">
                        {dailyStandup.done.length > 0
                          ? dailyStandup.done.join("; ")
                          : "No completed tasks yet."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#efdfc4] bg-[#fdf7ec] p-3">
                      <p className="label-caps text-[#a06d28]">In Progress</p>
                      <p className="mt-1 text-sm text-[#a06d28]">
                        {dailyStandup.in_progress.length > 0
                          ? dailyStandup.in_progress.join("; ")
                          : "No active tasks right now."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#f0d6d1] bg-[#fff3f1] p-3">
                      <p className="label-caps text-[#b53333]">Blocked</p>
                      <p className="mt-1 text-sm text-[#b53333]">
                        {dailyStandup.blocked.length > 0
                          ? dailyStandup.blocked.join("; ")
                          : "No blockers detected."}
                      </p>
                    </div>
                  </div>
                </article>
              )}

              <article className="surface-card rounded-2xl border border-[#f0eee6] bg-[#faf9f5] p-5 warm-ring print:hidden">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[#87867f]" />
                  <p className="label-caps text-[#87867f]">Plan History (Session)</p>
                </div>

                {planHistory.length === 0 ? (
                  <p className="mt-2 text-sm text-[#5e5d59]">
                    No snapshots yet. Every generation and reviewer rerun gets stored here.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {planHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-[#e8e6dc] bg-[#f5f4ed] px-3 py-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#4d4c48]">{item.label}</p>
                          <p className="truncate text-xs text-[#87867f]">{item.goal_preview}</p>
                          <p className="text-[11px] text-[#87867f]">{formatDateTimeLabel(item.created_at)}</p>
                        </div>
                        <button
                          onClick={() => handleLoadHistorySnapshot(item)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#e8e6dc] bg-[#faf9f5] px-3 py-1.5 text-xs font-semibold text-[#5e5d59] transition hover:bg-[#efede4]"
                        >
                          <History className="h-3.5 w-3.5" />
                          Load Snapshot
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </motion.section>
          )}
        </AnimatePresence>

        {!hasResult && loadingPhase === "none" && (
          <section className="surface-card rounded-[2rem] border border-[#f0eee6] bg-[#faf9f5] p-6 text-[#5e5d59] whisper-shadow print-card">
            <h3 className="editorial-title text-3xl text-[#141413]">How this layout works</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <article className="surface-card rounded-xl border border-[#e8e6dc] bg-[#f5f4ed] p-4 warm-ring print-card">
                <p className="label-caps text-[#87867f]">1. Draft</p>
                <p className="mt-1 text-sm leading-6">
                  Provide goal, priority, and deadline. Inputs are constrained to avoid invalid planning context.
                </p>
              </article>
              <article className="surface-card rounded-xl border border-[#e8e6dc] bg-[#f5f4ed] p-4 warm-ring print-card">
                <p className="label-caps text-[#87867f]">2. Refine</p>
                <p className="mt-1 text-sm leading-6">
                  Manually edit tasks and rerun the reviewer agent to critique your adjusted execution plan.
                </p>
              </article>
              <article className="surface-card rounded-xl border border-[#e8e6dc] bg-[#f5f4ed] p-4 warm-ring print-card">
                <p className="label-caps text-[#87867f]">3. Operate</p>
                <p className="mt-1 text-sm leading-6">
                  Use daily standup mode, inspect live agent-step trace, and reload prior session snapshots from plan history.
                </p>
              </article>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[#e8e6dc] bg-[#f5f4ed] py-6 text-center text-xs text-[#87867f] print:hidden">
        <p className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          Built with warm editorial pacing and agentic execution telemetry.
        </p>
      </footer>
    </div>
  );
}
