import type { Request, Response } from 'express';
import { updateTask, getTaskById } from '../db';
import type {
  UpdateTaskRequest,
  ApiSuccessResponse,
  ApiErrorResponse,
  TaskRow,
  TaskPriority,
  TaskStatus,
} from '../types';

const VALID_PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low'];
const VALID_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PATCH /tasks/:id
 * Updates one or more mutable fields of a specific task.
 */
export async function handleUpdateTaskStatus(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;

    if (!id) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Task ID is required.' },
      };
      res.status(400).json(error);
      return;
    }

    if (!UUID_PATTERN.test(id)) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Task ID must be a valid UUID.' },
      };
      res.status(400).json(error);
      return;
    }

    const body = req.body as Partial<UpdateTaskRequest>;

    const hasAnyField =
      body.task_id !== undefined ||
      body.title !== undefined ||
      body.description !== undefined ||
      body.estimated_hours !== undefined ||
      body.priority !== undefined ||
      body.status !== undefined ||
      body.dependencies !== undefined ||
      body.recommended_date !== undefined;

    if (!hasAnyField) {
      const error: ApiErrorResponse = {
        success: false,
        error: {
          code: 400,
          message:
            'At least one mutable field is required: task_id, title, description, estimated_hours, priority, status, dependencies, or recommended_date.',
        },
      };
      res.status(400).json(error);
      return;
    }

    if (body.task_id !== undefined && (typeof body.task_id !== 'string' || body.task_id.trim().length === 0)) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "task_id" must be a non-empty string when provided.' },
      };
      res.status(400).json(error);
      return;
    }

    if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim().length === 0)) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "title" must be a non-empty string when provided.' },
      };
      res.status(400).json(error);
      return;
    }

    if (body.description !== undefined && typeof body.description !== 'string') {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "description" must be a string when provided.' },
      };
      res.status(400).json(error);
      return;
    }

    if (
      body.estimated_hours !== undefined &&
      (typeof body.estimated_hours !== 'number' || !Number.isFinite(body.estimated_hours) || body.estimated_hours < 0)
    ) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "estimated_hours" must be a non-negative number when provided.' },
      };
      res.status(400).json(error);
      return;
    }

    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: `Invalid priority "${body.priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}.` },
      };
      res.status(400).json(error);
      return;
    }

    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: `Invalid status "${body.status}". Must be one of: ${VALID_STATUSES.join(', ')}.` },
      };
      res.status(400).json(error);
      return;
    }

    if (body.dependencies !== undefined) {
      if (!Array.isArray(body.dependencies) || body.dependencies.some((value) => typeof value !== 'string')) {
        const error: ApiErrorResponse = {
          success: false,
          error: { code: 400, message: 'Field "dependencies" must be an array of strings when provided.' },
        };
        res.status(400).json(error);
        return;
      }
    }

    if (body.recommended_date !== undefined) {
      if (typeof body.recommended_date !== 'string') {
        const error: ApiErrorResponse = {
          success: false,
          error: { code: 400, message: 'Field "recommended_date" must be a string when provided.' },
        };
        res.status(400).json(error);
        return;
      }

      if (body.recommended_date.trim().length > 0) {
        const parsed = Date.parse(body.recommended_date);
        if (Number.isNaN(parsed)) {
          const error: ApiErrorResponse = {
            success: false,
            error: {
              code: 400,
              message: 'Field "recommended_date" must be an ISO date (YYYY-MM-DD) or empty string.',
            },
          };
          res.status(400).json(error);
          return;
        }
      }
    }

    // ── Check task exists ────────────────────
    const existing = await getTaskById(id);

    if (!existing) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 404, message: `Task with ID "${id}" not found.` },
      };
      res.status(404).json(error);
      return;
    }

    // ── Update ───────────────────────────────
    const normalizedPatch: UpdateTaskRequest = {
      task_id: body.task_id?.trim(),
      title: body.title?.trim(),
      description: body.description,
      estimated_hours:
        body.estimated_hours !== undefined ? Math.max(0, Math.round(body.estimated_hours)) : undefined,
      priority: body.priority,
      status: body.status,
      dependencies: body.dependencies?.map((value) => value.trim()).filter((value) => value.length > 0),
      recommended_date: body.recommended_date?.trim(),
    };

    const updated = await updateTask(id, normalizedPatch);

    if (!updated) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 404, message: `Task with ID "${id}" not found.` },
      };
      res.status(404).json(error);
      return;
    }

    const response: ApiSuccessResponse<Omit<TaskRow, 'dependencies'> & { dependencies: string[] }> = {
      success: true,
      data: {
        ...updated,
        dependencies: JSON.parse(updated.dependencies || '[]'),
      },
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error updating task status.', err instanceof Error ? err.message : 'unknown');
    const error: ApiErrorResponse = {
      success: false,
      error: { code: 500, message: 'Internal server error while updating the task.' },
    };
    res.status(500).json(error);
  }
}
