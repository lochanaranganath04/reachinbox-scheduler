import { Router } from 'express';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { userRepo } from '../db/userRepo';
import { COOKIE, requireAuth, signSession } from '../middleware/auth';
import { sendSlackWelcome, slackAuthorizeUrl, slackConfigured, slackExchange } from '../services/slack';

export const authRouter = Router();

// ---- Email + password ----
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const hashPassword = async (pw: string) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scrypt(pw, salt, 64)).toString('hex')}`;
};
const verifyPassword = async (pw: string, stored: string) => {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(pw, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
};
const credentials = z.object({ email: z.string().trim().email().max(200), password: z.string().min(8).max(200) });
const setSession = (res: import('express').Response, userId: string) =>
  res.cookie(COOKIE, signSession(userId), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86_400_000 });

authRouter.post('/register', async (req, res) => {
  const p = credentials.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters' });
  const user = await userRepo.createWithPassword(p.data.email, p.data.email.split('@')[0], await hashPassword(p.data.password));
  if (!user) return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  setSession(res, user.id);
  res.status(201).json(user);
});

authRouter.post('/login', async (req, res) => {
  const p = credentials.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Enter a valid email and password' });
  const found = await userRepo.findForLogin(p.data.email);
  if (found && !found.hash) return res.status(401).json({ error: 'This account uses Google sign-in. Use "Login with Google".' });
  if (!found || !(await verifyPassword(p.data.password, found.hash!))) return res.status(401).json({ error: 'Incorrect email or password' });
  setSession(res, found.user.id);
  res.json(found.user);
});

const googleClient = () =>
  new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${env.BACKEND_URL}/auth/google/callback`);

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID) return res.status(500).send('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
  const state = randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60_000 });
  res.redirect(googleClient().generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
});

authRouter.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query as Record<string, string>;
    if (!code || !state || state !== req.cookies?.oauth_state) throw new Error('Invalid OAuth state');
    const client = googleClient();
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) throw new Error('Google profile incomplete');
    const user = await userRepo.upsertGoogle({ googleId: p.sub, email: p.email, name: p.name ?? p.email, avatarUrl: p.picture });
    res.clearCookie('oauth_state');
    setSession(res, user.id);
    res.redirect(`${env.FRONTEND_URL}/`);
  } catch (err) {
    console.error('[auth] google callback failed:', (err as Error).message);
    res.redirect(`${env.FRONTEND_URL}/?error=login_failed`);
  }
});

authRouter.get('/me', requireAuth, async (_req, res) => {
  const user = await userRepo.findById(res.locals.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json(user);
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

// ---- Slack OAuth ----
authRouter.get('/slack/connect', requireAuth, (_req, res) => {
  if (!slackConfigured()) return res.status(500).send('Slack OAuth is not configured (see README section 2.3)');
  const state = jwt.sign({ sub: res.locals.userId, purpose: 'slack' }, env.JWT_SECRET, { expiresIn: '10m' });
  res.redirect(slackAuthorizeUrl(state));
});

// Slack redirects here via an HTTPS tunnel, so the session cookie may be absent: identity comes from the signed state.
authRouter.get('/slack/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) throw new Error(error);
    const payload = jwt.verify(state, env.JWT_SECRET) as jwt.JwtPayload;
    if (payload.purpose !== 'slack' || !payload.sub) throw new Error('Invalid state');
    const conn = await slackExchange(code);
    await userRepo.saveSlack(payload.sub, conn.webhookUrl, conn.teamName, conn.channel);
    await sendSlackWelcome(conn.webhookUrl).catch(() => undefined);
    res.redirect(`${env.FRONTEND_URL}/?slack=connected`);
  } catch (err) {
    console.error('[auth] slack callback failed:', (err as Error).message);
    res.redirect(`${env.FRONTEND_URL}/?slack=error`);
  }
});
