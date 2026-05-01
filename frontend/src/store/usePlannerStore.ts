import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TaskPriority = "High" | "Medium" | "Low";
export type TaskStatus = "todo" | "in-progress" | "done";

export interface TaskRow {
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

export interface PlanResponse {
  review_summary: string;
  final_plan: {
    id: string;
    goal: string;
    tasks: TaskRow[];
  };
}

export interface DailyStandupResponse {
  standup_summary: string;
  done: string[];
  in_progress: string[];
  blocked: string[];
}

export interface PlanHistoryItem {
  id: string;
  label: string;
  created_at: string;
  goal_preview: string;
  result: PlanResponse;
}

export interface AgentTraceEntry {
  id: string;
  step: string;
  detail: string;
  state: "working" | "done" | "error";
  at: string;
}

export interface PlannerState {
  goal: string;
  deadline: string;
  userPriority: TaskPriority;
  result: PlanResponse | null;
  dailyStandup: DailyStandupResponse | null;
  agentTrace: AgentTraceEntry[];
  planHistory: PlanHistoryItem[];

  setGoal: (goal: string) => void;
  setDeadline: (deadline: string) => void;
  setUserPriority: (priority: TaskPriority) => void;
  setResult: (result: PlanResponse | null | ((prev: PlanResponse | null) => PlanResponse | null)) => void;
  setDailyStandup: (standup: DailyStandupResponse | null) => void;
  setAgentTrace: (trace: AgentTraceEntry[] | ((prev: AgentTraceEntry[]) => AgentTraceEntry[])) => void;
  setPlanHistory: (history: PlanHistoryItem[] | ((prev: PlanHistoryItem[]) => PlanHistoryItem[])) => void;
  
  resetStore: () => void;
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      goal: "",
      deadline: "",
      userPriority: "Medium",
      result: null,
      dailyStandup: null,
      agentTrace: [],
      planHistory: [],

      setGoal: (goal) => set({ goal }),
      setDeadline: (deadline) => set({ deadline }),
      setUserPriority: (userPriority) => set({ userPriority }),
      
      setResult: (resultOrUpdater) => set((state) => ({
        result: typeof resultOrUpdater === 'function' ? resultOrUpdater(state.result) : resultOrUpdater
      })),

      setDailyStandup: (dailyStandup) => set({ dailyStandup }),
      
      setAgentTrace: (traceOrUpdater) => set((state) => ({
        agentTrace: typeof traceOrUpdater === 'function' ? traceOrUpdater(state.agentTrace) : traceOrUpdater
      })),

      setPlanHistory: (historyOrUpdater) => set((state) => ({
        planHistory: typeof historyOrUpdater === 'function' ? historyOrUpdater(state.planHistory) : historyOrUpdater
      })),

      resetStore: () => set({
        goal: "",
        deadline: "",
        userPriority: "Medium",
        result: null,
        dailyStandup: null,
        agentTrace: [],
        // Typically we might want to keep plan history even on reset, but mimicking `handleReset` functionality:
      })
    }),
    {
      name: 'planner-storage',
    }
  )
);
