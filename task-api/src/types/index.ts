// ============================================
// Shared TypeScript interfaces for the API
// ============================================

/** Valid task priority levels */
export type TaskPriority = 'High' | 'Medium' | 'Low';

/** Valid task status values */
export type TaskStatus = 'todo' | 'in-progress' | 'done';

// ─── Database Row Types ──────────────────────

export interface PlanRow {
  id: string;
  goal: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  plan_id: string;
  task_id: string;
  title: string;
  description: string;
  estimated_hours: number;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: string; // JSON string from SQLite
  recommended_date: string;
  created_at: string;
}

// ─── Request Body Types ──────────────────────

export interface CreateTaskInput {
  task_id: string;
  title: string;
  description?: string;
  estimated_hours?: number;
  priority?: TaskPriority;
  status?: TaskStatus;
  dependencies?: string[];
  recommended_date?: string;
}

export interface CreatePlanRequest {
  goal: string;
  tasks: CreateTaskInput[];
}

export interface UpdateTaskStatusRequest {
  status: TaskStatus;
}

export interface UpdateTaskRequest {
  task_id?: string;
  title?: string;
  description?: string;
  estimated_hours?: number;
  priority?: TaskPriority;
  status?: TaskStatus;
  dependencies?: string[];
  recommended_date?: string;
}

// ─── Response Types ──────────────────────────

export interface PlanWithTasks extends PlanRow {
  tasks: TaskRow[];
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: number;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
