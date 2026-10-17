import 'express-async-errors';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { emailQueue } from './queue/emailQueue';
import { basicAuth } from './middleware/auth';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '12mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Live BullMQ dashboard
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue) as any], serverAdapter: board });
  app.use('/admin/queues', basicAuth, board.getRouter());

  app.use('/auth', authRouter);
  app.use('/api', apiRouter);

  // express-async-errors forwards rejected async handlers here
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] error:', err);
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Internal server error' });
  });
  return app;
}
