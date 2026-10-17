import { pool } from './pool';

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id text UNIQUE,
  password_hash text,
  email text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  smtp_host text NOT NULL,
  smtp_port int NOT NULL,
  smtp_user text NOT NULL,
  smtp_pass text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slack_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_name text,
  channel text,
  webhook_url text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  start_at timestamptz NOT NULL,
  delay_ms int NOT NULL,
  hourly_limit int NOT NULL,
  total int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  content_type text NOT NULL,
  size int NOT NULL,
  data bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_attachments_campaign_idx ON campaign_attachments (campaign_id);

CREATE TABLE IF NOT EXISTS email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES senders(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sending','sent','failed')),
  sent_at timestamptz,
  message_id text,
  preview_url text,
  error text,
  attempts int NOT NULL DEFAULT 0,
  hourly_limit int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_jobs_user_status_idx ON email_jobs (user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS email_jobs_status_seq_idx ON email_jobs (status, seq);
`;

export async function migrate(): Promise<void> {
  await pool.query(SQL);
}
