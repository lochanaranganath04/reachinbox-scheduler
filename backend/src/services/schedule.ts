import { z } from 'zod';
import { pool } from '../db/pool';
import { env } from '../config/env';
import { mapRow } from '../db/emailRepo';
import { attachmentRepo } from '../db/attachmentRepo';
import { enqueueEmails } from '../queue/emailQueue';
import { sanitizeBody, htmlToText } from '../lib/html';
import { listSenders } from './senders';
import { indexEmails } from './search';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(200_000),
  leads: z.array(z.string().trim().toLowerCase()).min(1).max(20_000),
  startTime: z.string().datetime({ offset: true }),
  delaySeconds: z.number().min(0).max(86_400),
  hourlyLimit: z.number().int().min(1).max(100_000),
  senderId: z.string().uuid().optional(), // omit to rotate across all senders
  attachments: z
    .array(z.object({ name: z.string().min(1).max(255), type: z.string().max(100).default('application/octet-stream'), data: z.string() }))
    .max(5)
    .default([]),
});
export type ScheduleInput = z.input<typeof scheduleSchema>;
export type ParsedSchedule = z.output<typeof scheduleSchema>;

const bad = (message: string) => Object.assign(new Error(message), { status: 400 });

export async function scheduleCampaign(userId: string, input: ParsedSchedule): Promise<{ campaignId: string; count: number; skipped: number }> {
  const leads = [...new Set(input.leads.filter((l) => EMAIL_RE.test(l)))];
  if (leads.length === 0) throw bad('No valid email addresses in leads');

  const body = sanitizeBody(input.body);
  if (!htmlToText(body)) throw bad('Email body is empty');

  const files = input.attachments.map((a) => {
    const data = Buffer.from(a.data, 'base64');
    return { name: a.name, type: a.type, data, size: data.length };
  });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENT_BYTES) throw bad('Attachments exceed the 5 MB limit');

  const all = await listSenders();
  const senders = input.senderId ? all.filter((s) => s.id === input.senderId) : all;
  if (senders.length === 0) throw bad('Unknown sender');

  const start = Math.max(new Date(input.startTime).getTime(), Date.now());
  const delayMs = Math.round(input.delaySeconds * 1000);
  const hourlyLimit = Math.min(input.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);

  const senderIds = leads.map((_, i) => senders[i % senders.length].id);
  const times = leads.map((_, i) => new Date(start + i * delayMs).toISOString());

  const client = await pool.connect();
  let rows;
  let campaignId: string;
  try {
    await client.query('BEGIN');
    const c = await client.query(
      `INSERT INTO campaigns (user_id, subject, body, start_at, delay_ms, hourly_limit, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, input.subject, body, new Date(start), delayMs, hourlyLimit, leads.length],
    );
    campaignId = c.rows[0].id;
    await attachmentRepo.insert(client, campaignId, files);
    const ins = await client.query(
      `WITH ins AS (
         INSERT INTO email_jobs (user_id, campaign_id, sender_id, to_email, subject, body, scheduled_at, hourly_limit)
         SELECT $1::uuid, $2::uuid, u.s, u.e, $3::text, $4::text, u.t, $5::int
         FROM unnest($6::uuid[], $7::text[], $8::timestamptz[]) AS u(s, e, t)
         RETURNING *
       )
       SELECT ins.*, s.email AS sender_email, s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, usr.name AS user_name
       FROM ins JOIN senders s ON s.id = ins.sender_id JOIN users usr ON usr.id = ins.user_id`,
      [userId, campaignId, input.subject, body, hourlyLimit, senderIds, leads, times],
    );
    rows = ins.rows.map(mapRow);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // After commit. If enqueue fails the rows stay 'scheduled' and boot-time reconcile picks them up.
  await enqueueEmails(rows);
  void indexEmails(rows);
  return { campaignId, count: rows.length, skipped: input.leads.length - leads.length };
}
