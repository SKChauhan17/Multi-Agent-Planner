import { Router } from 'express';
import planRouter from './plan.routes';
import taskRouter from './task.routes';

const apiRouter: Router = Router();

apiRouter.use('/plans', planRouter);
apiRouter.use('/tasks', taskRouter);

export default apiRouter;
