import { pool } from './pool';
import type { UserRow } from '../types';

const mapUser = (r: any): UserRow => ({ id: r.id, email: r.email, name: r.name, avatarUrl: r.avatar_url });

export const userRepo = {
  /** Links Google to an existing account with the same email, otherwise creates one. */
  async upsertGoogle(p: { googleId: string; email: string; name: string; avatarUrl?: string | null }): Promise<UserRow> {
    const found = await pool.query(
      'SELECT id FROM users WHERE google_id = $1 OR lower(email) = lower($2) ORDER BY (google_id = $1) DESC LIMIT 1',
      [p.googleId, p.email],
    );
    if (found.rows[0]) {
      const { rows } = await pool.query(
        'UPDATE users SET google_id = $2, name = $3, avatar_url = $4 WHERE id = $1 RETURNING *',
        [found.rows[0].id, p.googleId, p.name, p.avatarUrl ?? null],
      );
      return mapUser(rows[0]);
    }
    const { rows } = await pool.query('INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1,$2,$3,$4) RETURNING *', [
      p.googleId,
      p.email,
      p.name,
      p.avatarUrl ?? null,
    ]);
    return mapUser(rows[0]);
  },

  async createWithPassword(email: string, name: string, hash: string): Promise<UserRow | null> {
    const { rows } = await pool.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',
      [email, name, hash],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  },

  async findForLogin(email: string): Promise<{ user: UserRow; hash: string | null } | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return rows[0] ? { user: mapUser(rows[0]), hash: rows[0].password_hash } : null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  },

  async getSlack(userId: string): Promise<{ webhookUrl: string; teamName: string | null; channel: string | null } | null> {
    const { rows } = await pool.query('SELECT * FROM slack_connections WHERE user_id = $1', [userId]);
    const r = rows[0];
    return r ? { webhookUrl: r.webhook_url, teamName: r.team_name, channel: r.channel } : null;
  },

  async saveSlack(userId: string, webhookUrl: string, teamName: string | null, channel: string | null): Promise<void> {
    await pool.query(
      `INSERT INTO slack_connections (user_id, webhook_url, team_name, channel) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url, team_name = EXCLUDED.team_name,
         channel = EXCLUDED.channel, connected_at = now()`,
      [userId, webhookUrl, teamName, channel],
    );
  },

  async deleteSlack(userId: string): Promise<void> {
    await pool.query('DELETE FROM slack_connections WHERE user_id = $1', [userId]);
  },
};
