import { getConnection } from './connection';
import crypto from 'node:crypto';
import type {
  PlanRow,
  TaskRow,
  CreatePlanRequest,
  UpdateTaskRequest,
  UpdateTaskStatusRequest,
  PlanWithTasks,
} from '../types/index';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Creates a plan and all its tasks within a single transaction.
 * Returns the full plan with tasks on success.
 */
export async function createPlan(data: CreatePlanRequest): Promise<PlanWithTasks> {
  const planId = generateId();
  const db = await getConnection();

  const taskRows: TaskRow[] = [];

  await db.run('BEGIN TRANSACTION');

  try {
    await db.run(`INSERT INTO plans (id, goal) VALUES (?, ?)`, [planId, data.goal]);

    for (const task of data.tasks) {
      const taskId = generateId();
      const safeTaskPublicId = task.task_id?.trim() || `T${taskRows.length + 1}`;
      await db.run(
        `INSERT INTO tasks (id, plan_id, task_id, title, description, estimated_hours, priority, status, dependencies, recommended_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId,
          planId,
          safeTaskPublicId,
          task.title,
          task.description ?? '',
          task.estimated_hours ?? 0,
          task.priority ?? 'Medium',
          task.status ?? 'todo',
          JSON.stringify(task.dependencies) ?? '[]',
          task.recommended_date ?? '',
        ]
      );

      // We approximate the result since SQLite wrapper doesn't map inserted rows out-of-the-box dynamically natively.
      taskRows.push({
        id: taskId,
        plan_id: planId,
        task_id: safeTaskPublicId,
        title: task.title,
        description: task.description ?? '',
        estimated_hours: task.estimated_hours ?? 0,
        priority: task.priority ?? 'Medium',
        status: task.status ?? 'todo',
        dependencies: JSON.stringify(task.dependencies) ?? '[]',
        recommended_date: task.recommended_date ?? '',
        created_at: new Date().toISOString(),
      });
    }

    await db.run('COMMIT');

    const plan = await db.get<PlanRow>(`SELECT id, goal, created_at FROM plans WHERE id = ?`, [planId]);
    if (!plan) throw new Error('Failed to retrieve newly created plan');

    return { ...plan, tasks: taskRows };
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}

/**
 * Fetches a plan by ID along with all associated tasks.
 * Returns null if the plan doesn't exist.
 */
export async function getPlanById(planId: string): Promise<PlanWithTasks | null> {
  const db = await getConnection();

  const plan = await db.get<PlanRow>(`SELECT id, goal, created_at FROM plans WHERE id = ?`, [planId]);
  if (!plan) return null;

  const tasks = await db.all<TaskRow[]>(
    `SELECT id, plan_id, task_id, title, description, estimated_hours, priority, status, dependencies, recommended_date, created_at
     FROM tasks WHERE plan_id = ? ORDER BY created_at ASC`,
    [planId]
  );

  return { ...plan, tasks };
}

/**
 * Fetches a single task by its ID.
 * Returns null if the task doesn't exist.
 */
export async function getTaskById(taskId: string): Promise<TaskRow | null> {
  const db = await getConnection();
  const task = await db.get<TaskRow>(
    `SELECT id, plan_id, task_id, title, description, estimated_hours, priority, status, dependencies, recommended_date, created_at
     FROM tasks WHERE id = ?`,
    [taskId]
  );
  return task ?? null;
}

/**
 * Updates the status of a task. Returns the updated task or null if not found.
 */
export async function updateTaskStatus(taskId: string, data: UpdateTaskStatusRequest): Promise<TaskRow | null> {
  return updateTask(taskId, { status: data.status });
}

/**
 * Updates mutable task fields and returns the updated row.
 */
export async function updateTask(taskId: string, data: UpdateTaskRequest): Promise<TaskRow | null> {
  const db = await getConnection();

  const existing = await getTaskById(taskId);
  if (!existing) return null;

  const nextTaskId = data.task_id?.trim() || existing.task_id;
  const nextTitle = data.title?.trim() || existing.title;
  const nextDescription = data.description ?? existing.description;
  const nextEstimatedHours = data.estimated_hours ?? existing.estimated_hours;
  const nextPriority = data.priority ?? existing.priority;
  const nextStatus = data.status ?? existing.status;
  const nextDependencies = data.dependencies ? JSON.stringify(data.dependencies) : existing.dependencies;
  const nextRecommendedDate = data.recommended_date ?? existing.recommended_date;

  await db.run(
    `UPDATE tasks
     SET task_id = ?,
         title = ?,
         description = ?,
         estimated_hours = ?,
         priority = ?,
         status = ?,
         dependencies = ?,
         recommended_date = ?
     WHERE id = ?`,
    [
      nextTaskId,
      nextTitle,
      nextDescription,
      nextEstimatedHours,
      nextPriority,
      nextStatus,
      nextDependencies,
      nextRecommendedDate,
      taskId,
    ]
  );

  return {
    ...existing,
    task_id: nextTaskId,
    title: nextTitle,
    description: nextDescription,
    estimated_hours: nextEstimatedHours,
    priority: nextPriority,
    status: nextStatus,
    dependencies: nextDependencies,
    recommended_date: nextRecommendedDate,
  };
}

/**
 * Deletes a plan and cascades deletion to all associated tasks.
 * Returns true if the plan was found and deleted, false otherwise.
 */
export async function deletePlan(planId: string): Promise<boolean> {
  const db = await getConnection();

  const existing = await db.get<PlanRow>(`SELECT id FROM plans WHERE id = ?`, [planId]);
  if (!existing) return false;

  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(`DELETE FROM tasks WHERE plan_id = ?`, [planId]);
    await db.run(`DELETE FROM plans WHERE id = ?`, [planId]);
    await db.run('COMMIT');
    return true;
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}
