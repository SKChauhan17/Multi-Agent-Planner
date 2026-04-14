import { Router } from 'express';
import { handleUpdateTaskStatus } from '../controllers';

const taskRouter: Router = Router();

// PATCH /tasks/:id → Update task status
taskRouter.patch('/:id', handleUpdateTaskStatus);

export default taskRouter;
