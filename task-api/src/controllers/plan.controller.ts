import type { Request, Response } from 'express';
import {
  createPlan,
  getPlanById,
  deletePlan,
} from '../db';
import type {
  CreatePlanRequest,
  ApiSuccessResponse,
  ApiErrorResponse,
  PlanWithTasks,
  TaskPriority,
  TaskStatus,
} from '../types';

const VALID_PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low'];
const VALID_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];

/**
 * POST /plans
 * Creates a new plan with associated tasks in a single transaction.
 */
export async function handleCreatePlan(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Partial<CreatePlanRequest>;

    // ── Validate goal ────────────────────────
    if (!body.goal || typeof body.goal !== 'string' || body.goal.trim().length === 0) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "goal" is required and must be a non-empty string.' },
      };
      res.status(400).json(error);
      return;
    }

    // ── Validate tasks array ─────────────────
    if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "tasks" is required and must be a non-empty array.' },
      };
      res.status(400).json(error);
      return;
    }

    // ── Validate each task ───────────────────
    for (let i = 0; i < body.tasks.length; i++) {
      const task = body.tasks[i];

      if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) {
        const error: ApiErrorResponse = {
          success: false,
          error: { code: 400, message: `Task at index ${i}: "title" is required and must be a non-empty string.` },
        };
        res.status(400).json(error);
        return;
      }

      if (task.priority && !VALID_PRIORITIES.includes(task.priority)) {
        const error: ApiErrorResponse = {
          success: false,
          error: { code: 400, message: `Task at index ${i}: "priority" must be one of: ${VALID_PRIORITIES.join(', ')}.` },
        };
        res.status(400).json(error);
        return;
      }

      if (task.status && !VALID_STATUSES.includes(task.status)) {
        const error: ApiErrorResponse = {
          success: false,
          error: { code: 400, message: `Task at index ${i}: "status" must be one of: ${VALID_STATUSES.join(', ')}.` },
        };
        res.status(400).json(error);
        return;
      }

      if (task.estimated_hours !== undefined && (typeof task.estimated_hours !== 'number' || task.estimated_hours < 0)) {
        const error: ApiErrorResponse = {
          success: false,
          error: { code: 400, message: `Task at index ${i}: "estimated_hours" must be a non-negative number.` },
        };
        res.status(400).json(error);
        return;
      }
    }

    // ── Create plan + tasks ──────────────────
    const result = await createPlan({
      goal: body.goal.trim(),
      tasks: body.tasks,
    });

    const response: ApiSuccessResponse<PlanWithTasks> = {
      success: true,
      data: result,
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('Error creating plan:', err);
    const error: ApiErrorResponse = {
      success: false,
      error: { code: 500, message: 'Internal server error while creating the plan.' },
    };
    res.status(500).json(error);
  }
}

/**
 * GET /plans/:id
 * Fetches a plan and all associated tasks.
 */
export async function handleGetPlan(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;

    if (!id) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Plan ID is required.' },
      };
      res.status(400).json(error);
      return;
    }

    const plan = await getPlanById(id);

    if (!plan) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 404, message: `Plan with ID "${id}" not found.` },
      };
      res.status(404).json(error);
      return;
    }

    const response: ApiSuccessResponse<PlanWithTasks> = {
      success: true,
      data: plan,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching plan:', err);
    const error: ApiErrorResponse = {
      success: false,
      error: { code: 500, message: 'Internal server error while fetching the plan.' },
    };
    res.status(500).json(error);
  }
}

/**
 * DELETE /plans/:id
 * Deletes a plan and cascades to all associated tasks.
 */
export async function handleDeletePlan(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;

    if (!id) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Plan ID is required.' },
      };
      res.status(400).json(error);
      return;
    }

    const deleted = await deletePlan(id);

    if (!deleted) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 404, message: `Plan with ID "${id}" not found.` },
      };
      res.status(404).json(error);
      return;
    }

    const response: ApiSuccessResponse<{ message: string }> = {
      success: true,
      data: { message: `Plan "${id}" and all associated tasks deleted successfully.` },
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error deleting plan:', err);
    const error: ApiErrorResponse = {
      success: false,
      error: { code: 500, message: 'Internal server error while deleting the plan.' },
    };
    res.status(500).json(error);
  }
}
