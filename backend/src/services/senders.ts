import nodemailer from 'nodemailer';
import { pool } from '../db/pool';
import { env } from '../config/env';
import type { Sender } from '../types';

/** Make sure at least SENDER_COUNT Ethereal senders exist (own accounts via env, rest auto-created). */
export async function ensureSenders(): Promise<void> {
  for (const pair of env.ETHEREAL_ACCOUNTS.split(',').map((s) => s.trim()).filter(Boolean)) {
    const idx = pair.lastIndexOf(':');
    const user = pair.slice(0, idx);
    const pass = pair.slice(idx + 1);
    await pool.query(
      `INSERT INTO senders (email, smtp_host, smtp_port, smtp_user, smtp_pass)
       VALUES ($1,'smtp.ethereal.email',587,$1,$2)
       ON CONFLICT (email) DO UPDATE SET smtp_pass = EXCLUDED.smtp_pass`,
      [user, pass],
    );
  }
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM senders');
  for (let i = rows[0].n; i < env.SENDER_COUNT; i++) {
    const acc = await nodemailer.createTestAccount();
    // await pool.query(
    //   `INSERT INTO senders (email, smtp_host, smtp_port, smtp_user, smtp_pass) VALUES ($1,$2,$3,$4,$5)`,
    //   [acc.user, acc.smtp.host, acc.smtp.port, acc.user, acc.pass],
    // );
  await pool.query(
    `INSERT INTO senders (email, smtp_host, smtp_port, smtp_user, smtp_pass)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (email) DO NOTHING`,
    [acc.user, acc.smtp.host, acc.smtp.port, acc.user, acc.pass],
  );

    console.log(`[senders] created Ethereal account ${acc.user}`);
  }
}

export async function listSenders(): Promise<Sender[]> {
  const { rows } = await pool.query('SELECT * FROM senders ORDER BY created_at, email');
  return rows.map((r) => ({ id: r.id, email: r.email, host: r.smtp_host, port: r.smtp_port, user: r.smtp_user, pass: r.smtp_pass }));
}
