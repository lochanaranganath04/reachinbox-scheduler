import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const COOKIE = 'session';

export const signSession = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' });

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    res.locals.userId = payload.sub as string;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
}

export function basicAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.BULL_BOARD_USER) return next();
  const [scheme, b64] = (req.headers.authorization ?? '').split(' ');
  if (scheme === 'Basic' && b64 && Buffer.from(b64, 'base64').toString() === `${env.BULL_BOARD_USER}:${env.BULL_BOARD_PASS}`) return next();
  res.set('WWW-Authenticate', 'Basic realm="Bull Board"').status(401).send('Authentication required');
}
