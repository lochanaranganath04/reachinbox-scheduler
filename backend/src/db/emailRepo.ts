import { pool } from './pool';
import type { EmailRow } from '../types';

const SELECT = `
  SELECT e.*, s.email AS sender_email, s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, u.name AS user_name
  FROM email_jobs e JOIN senders s ON s.id = e.sender_id JOIN users u ON u.id = e.user_id`;

export type View = 'scheduled' | 'sent';
export const STATUSES: Record<View, string[]> = { scheduled: ['scheduled', 'sending'], sent: ['sent', 'failed'] };

/** Optional single-status filter, restricted to statuses that belong to the view. */
export const pick = (view: View, status?: string): string[] => (status && STATUSES[view].includes(status) ? [status] : STATUSES[view]);

export function mapRow(r: any): EmailRow {
  return {
    id: r.id,
    seq: Number(r.seq),
    userId: r.user_id,
    campaignId: r.campaign_id,
    senderId: r.sender_id,
    toEmail: r.to_email,
    subject: r.subject,
    body: r.body,
    scheduledAt: r.scheduled_at,
    status: r.status,
    sentAt: r.sent_at,
    messageId: r.message_id,
    previewUrl: r.preview_url,
    error: r.error,
    attempts: r.attempts,
    hourlyLimit: r.hourly_limit,
    updatedAt: r.updated_at,
    userName: r.user_name,
    sender: {
      id: r.sender_id,
      email: r.sender_email,
      host: r.smtp_host,
      port: r.smtp_port,
      user: r.smtp_user,
      pass: r.smtp_pass,
    },
  };
}

export const emailRepo = {
  async findById(id: string): Promise<EmailRow | null> {
    const { rows } = await pool.query(`${SELECT} WHERE e.id = $1`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  },

  /** Atomic scheduled -> sending transition. Only one caller can win. */
  async claim(id: string): Promise<boolean> {
    const r = await pool.query(
      `UPDATE email_jobs SET status = 'sending', attempts = attempts + 1, updated_at = now()
       WHERE id = $1 AND status = 'scheduled'`,
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  },

  async markSent(id: string, messageId: string, previewUrl: string | null): Promise<EmailRow> {
    await pool.query(
      `UPDATE email_jobs SET status = 'sent', sent_at = now(), message_id = $2, preview_url = $3, error = NULL, updated_at = now()
       WHERE id = $1`,
      [id, messageId, previewUrl],
    );
    return (await emailRepo.findById(id))!;
  },

  async markFailed(id: string, error: string): Promise<EmailRow> {
    await pool.query(`UPDATE email_jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [id, error.slice(0, 1000)]);
    return (await emailRepo.findById(id))!;
  },

  /** sending -> scheduled, used between retry attempts. */
  async release(id: string, error: string): Promise<void> {
    await pool.query(
      `UPDATE email_jobs SET status = 'scheduled', error = $2, updated_at = now() WHERE id = $1 AND status = 'sending'`,
      [id, error.slice(0, 1000)],
    );
  },

  async reschedule(id: string, when: Date): Promise<void> {
    await pool.query(`UPDATE email_jobs SET scheduled_at = $2, updated_at = now() WHERE id = $1 AND status = 'scheduled'`, [id, when]);
  },

  /** Rows whose worker died mid-send go back to scheduled. */
  async releaseStale(minutes: number): Promise<number> {
    const r = await pool.query(
      `UPDATE email_jobs SET status = 'scheduled', updated_at = now()
       WHERE status = 'sending' AND updated_at < now() - ($1::int * interval '1 minute')`,
      [minutes],
    );
    return r.rowCount ?? 0;
  },

  /** Keyset-paginated scan used by boot-time reconcile. */
  async scheduledAfterSeq(afterSeq: number, limit: number): Promise<EmailRow[]> {
    const { rows } = await pool.query(`${SELECT} WHERE e.status = 'scheduled' AND e.seq > $1 ORDER BY e.seq ASC LIMIT $2`, [afterSeq, limit]);
    return rows.map(mapRow);
  },

  async list(userId: string, view: View, limit: number, offset: number, status?: string): Promise<{ items: EmailRow[]; total: number }> {
    const statuses = pick(view, status);
    const order = view === 'scheduled' ? 'e.scheduled_at ASC, e.seq ASC' : 'COALESCE(e.sent_at, e.updated_at) DESC';
    const [items, count] = await Promise.all([
      pool.query(`${SELECT} WHERE e.user_id = $1 AND e.status = ANY($2) ORDER BY ${order} LIMIT $3 OFFSET $4`, [userId, statuses, limit, offset]),
      pool.query(`SELECT count(*)::int AS n FROM email_jobs WHERE user_id = $1 AND status = ANY($2)`, [userId, statuses]),
    ]);
    return { items: items.rows.map(mapRow), total: count.rows[0].n };
  },

  async searchSql(userId: string, view: View, q: string, limit: number, offset: number, status?: string): Promise<{ items: EmailRow[]; total: number }> {
    const statuses = pick(view, status);
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const where = `e.user_id = $1 AND e.status = ANY($2) AND (e.to_email ILIKE $3 OR e.subject ILIKE $3 OR e.body ILIKE $3)`;
    const [items, count] = await Promise.all([
      pool.query(`${SELECT} WHERE ${where} ORDER BY e.scheduled_at ASC LIMIT $4 OFFSET $5`, [userId, statuses, like, limit, offset]),
      pool.query(`SELECT count(*)::int AS n FROM email_jobs e WHERE ${where}`, [userId, statuses, like]),
    ]);
    return { items: items.rows.map(mapRow), total: count.rows[0].n };
  },

  async counts(userId: string): Promise<{ scheduled: number; sent: number }> {
    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE status IN ('scheduled','sending'))::int AS scheduled,
         count(*) FILTER (WHERE status IN ('sent','failed'))::int AS sent
       FROM email_jobs WHERE user_id = $1`,
      [userId],
    );
    return rows[0];
  },
};
