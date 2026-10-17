import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { emailRepo } from '../db/emailRepo';
import { attachmentRepo } from '../db/attachmentRepo';
import { userRepo } from '../db/userRepo';
import { toDetailDto, toDto } from '../lib/dto';
import { scheduleCampaign, scheduleSchema } from '../services/schedule';
import { searchEmails } from '../services/search';
import { listSenders } from '../services/senders';

export const apiRouter = Router();
apiRouter.use(requireAuth);

apiRouter.post('/schedule', async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors });
  const result = await scheduleCampaign(res.locals.userId, parsed.data);
  res.status(201).json(result);
});

const listQuery = z.object({
  view: z.enum(['scheduled', 'sent']).default('scheduled'),
  status: z.enum(['scheduled', 'sending', 'sent', 'failed']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

apiRouter.get('/emails', async (req, res) => {
  const p = listQuery.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: 'Invalid query' });
  const { view, status, q, page, pageSize } = p.data;
  const userId = res.locals.userId as string;
  if (q) return res.json({ ...(await searchEmails(userId, view, q, page, pageSize, status)), page, pageSize });
  const { items, total } = await emailRepo.list(userId, view, pageSize, (page - 1) * pageSize, status);
  res.json({ items: items.map(toDto), total, page, pageSize });
});

apiRouter.get('/emails/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const row = await emailRepo.findById(req.params.id);
  if (!row || row.userId !== res.locals.userId) return res.status(404).json({ error: 'Email not found' });
  res.json(toDetailDto(row, await attachmentRepo.meta(row.campaignId)));
});

apiRouter.get('/attachments/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const file = await attachmentRepo.get(req.params.id, res.locals.userId);
  if (!file) return res.status(404).json({ error: 'Attachment not found' });
  res.set('Content-Type', file.type);
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
});

apiRouter.get('/stats', async (_req, res) => res.json(await emailRepo.counts(res.locals.userId)));

apiRouter.get('/senders', async (_req, res) => res.json((await listSenders()).map((s) => ({ id: s.id, email: s.email }))));

apiRouter.get('/slack', async (_req, res) => {
  const c = await userRepo.getSlack(res.locals.userId);
  res.json({ connected: Boolean(c), teamName: c?.teamName ?? null, channel: c?.channel ?? null });
});

apiRouter.delete('/slack', async (_req, res) => {
  await userRepo.deleteSlack(res.locals.userId);
  res.json({ ok: true });
});
