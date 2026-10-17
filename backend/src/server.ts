import { env } from './config/env';
import { pool } from './db/pool';
import { migrate } from './db/migrate';
import { redis } from './queue/connection';
import { emailQueue } from './queue/emailQueue';
import { ensureSenders } from './services/senders';
import { ensureIndex } from './services/search';
import { reconcile } from './services/reconcile';
import { createEmailWorker } from './workers/email.worker';
import { createApp } from './app';

async function main() {
  await migrate();
  await ensureSenders();
  await ensureIndex();
  await reconcile();

  const worker = env.RUN_WORKER === 'true' ? createEmailWorker() : null;
  const server = createApp().listen(env.PORT, () => {
    console.log(`[api] listening on :${env.PORT}  (Bull Board: ${env.BACKEND_URL}/admin/queues)`);
  });

  const shutdown = async () => {
    console.log('[shutdown] draining...');
    server.close();
    await worker?.close(); // waits for in-flight jobs; the rest stay safely in Redis
    await emailQueue.close();
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
