import 'express-async-errors';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
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
  app.set('trust proxy', 1);
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

  // Serve built frontend SPA in production if dist exists
  const candidatePaths = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../frontend/dist'),
    path.resolve(__dirname, './public'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
  ];
  const staticPath = candidatePaths.find((p) => fs.existsSync(p));

  if (staticPath) {
    app.use(express.static(staticPath));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/auth') ||
        req.path.startsWith('/admin') ||
        req.path.startsWith('/health')
      ) {
        return next();
      }
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  // express-async-errors forwards rejected async handlers here
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] error:', err);
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Internal server error' });
  });
  return app;
}
