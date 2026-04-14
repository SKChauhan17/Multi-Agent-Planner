import type { Request, Response } from 'express';
import { updateTaskStatus, getTaskById } from '../db';
import type {
  UpdateTaskStatusRequest,
  ApiSuccessResponse,
  ApiErrorResponse,
  TaskRow,
  TaskStatus,
} from '../types';

const VALID_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];

/**
 * PATCH /tasks/:id
 * Updates the status of a specific task.
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

    const body = req.body as Partial<UpdateTaskStatusRequest>;

    // ── Validate status field ────────────────
    if (!body.status || typeof body.status !== 'string') {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: 'Field "status" is required and must be a string.' },
      };
      res.status(400).json(error);
      return;
    }

    if (!VALID_STATUSES.includes(body.status)) {
      const error: ApiErrorResponse = {
        success: false,
        error: { code: 400, message: `Invalid status "${body.status}". Must be one of: ${VALID_STATUSES.join(', ')}.` },
      };
      res.status(400).json(error);
      return;
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
    const updated = await updateTaskStatus(id, { status: body.status });

    const response: ApiSuccessResponse<TaskRow> = {
      success: true,
      data: updated!,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error updating task status:', err);
    const error: ApiErrorResponse = {
      success: false,
      error: { code: 500, message: 'Internal server error while updating the task.' },
    };
    res.status(500).json(error);
  }
}
