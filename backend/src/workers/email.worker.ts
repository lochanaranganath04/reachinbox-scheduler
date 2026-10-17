import { DelayedError, Job, Worker } from 'bullmq';
import { env } from '../config/env';
import { bullConnection, redis } from '../queue/connection';
import { QUEUE_NAME } from '../queue/emailQueue';
import { emailRepo } from '../db/emailRepo';
import { sendEmail } from '../services/smtp';
import { indexEmail } from '../services/search';
import { notifyRateLimit } from '../services/slack';
import { hourWindow, nextHourMs } from '../lib/time';
import type { EmailJobData } from '../types';

/** Atomic "take one slot" for a sender+hour window. Returns 1 if allowed, 0 if the cap is hit. */
const CONSUME = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1`;

async function processor(job: Job<EmailJobData>, token?: string): Promise<void> {
  const row = await emailRepo.findById(job.data.emailId);
  // Idempotency: anything not 'scheduled' (sent, failed, being sent) is not ours to send.
  if (!row || row.status !== 'scheduled') return;

  const win = hourWindow();
  const key = `rl:${row.senderId}:${win}`;
  const allowed = Number(await redis.eval(CONSUME, 1, key, row.hourlyLimit, 7200));

  if (allowed === 0) {
    // Cap reached: never drop or fail. Push to the next hour window, keeping rough FIFO via seq.
    const next = nextHourMs() + (row.seq % 1000);
    await notifyRateLimit(row.userId, row.sender.email, row.senderId, row.hourlyLimit, win);
    await emailRepo.reschedule(row.id, new Date(next));
    void indexEmail({ ...row, scheduledAt: new Date(next) });
    await job.moveToDelayed(next, token);
    throw new DelayedError();
  }

  if (!(await emailRepo.claim(row.id))) {
    await redis.decr(key); // another worker owns it; give the slot back
    return;
  }

  let info;
  try {
    info = await sendEmail(row);
  } catch (err) {
    await redis.decr(key); // failed sends don't burn quota
    const msg = (err as Error).message ?? String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      void indexEmail(await emailRepo.markFailed(row.id, msg));
    } else {
      await emailRepo.release(row.id, msg);
    }
    throw err; // BullMQ applies retry/backoff
  }

  const sent = await emailRepo.markSent(row.id, info.messageId, info.previewUrl);
  void indexEmail(sent);
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(QUEUE_NAME, processor, {
    connection: bullConnection,
    concurrency: env.WORKER_CONCURRENCY,
    // Queue-wide (all workers/instances): at most 1 send per MIN_DELAY_MS.
    limiter: { max: 1, duration: env.MIN_DELAY_MS },
  });
  worker.on('failed', (job, err) => console.warn(`[worker] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message));
  worker.on('error', (err) => console.error('[worker] error:', err.message));
  console.log(`[worker] started: concurrency=${env.WORKER_CONCURRENCY}, min delay=${env.MIN_DELAY_MS}ms`);
  return worker;
}
