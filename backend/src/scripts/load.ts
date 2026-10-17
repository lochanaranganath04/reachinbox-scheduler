// Load simulation: npm run load -- 1000   (schedules N emails ~10s from now for the first user)
import { pool } from '../db/pool';
import { redis } from '../queue/connection';
import { emailQueue } from '../queue/emailQueue';
import { scheduleCampaign } from '../services/schedule';

async function main() {
  const n = Number(process.argv[2] ?? 1000);
  const { rows } = await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
  if (!rows[0]) throw new Error('Log in via the dashboard once first so a user exists.');
  const leads = Array.from({ length: n }, (_, i) => `load-${i}@example.com`);
  const r = await scheduleCampaign(rows[0].id, {
    attachments: [],
    subject: `Load test (${n})`,
    body: 'Hello from the load test.',
    leads,
    startTime: new Date(Date.now() + 10_000).toISOString(),
    delaySeconds: 0, // everything due at the same instant
    hourlyLimit: 50, // forces overflow into later hour windows
  });
  console.log(`Scheduled ${r.count} emails for ~10s from now. Watch /admin/queues.`);
  await emailQueue.close();
  await pool.end();
  redis.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
