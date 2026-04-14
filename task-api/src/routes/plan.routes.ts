import { Router } from 'express';
import {
  handleCreatePlan,
  handleGetPlan,
  handleDeletePlan,
} from '../controllers';

const planRouter: Router = Router();

// POST   /plans      → Create a plan with tasks
planRouter.post('/', handleCreatePlan);

// GET    /plans/:id  → Fetch a plan + tasks
planRouter.get('/:id', handleGetPlan);

// DELETE /plans/:id  → Delete a plan + cascade tasks
planRouter.delete('/:id', handleDeletePlan);

export default planRouter;
