// Standalone worker process: `npm run worker` (use with RUN_WORKER=false on the API).
import { pool } from './db/pool';
import { redis } from './queue/connection';
import { emailQueue } from './queue/emailQueue';
import { ensureIndex } from './services/search';
import { createEmailWorker } from './workers/email.worker';

async function main() {
  await ensureIndex();
  const worker = createEmailWorker();
  const shutdown = async () => {
    await worker.close();
    await emailQueue.close();
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
