import { Queue } from 'bullmq';
import { env } from '../config/env';
import { bullConnection } from './connection';
import type { EmailJobData, EmailRow } from '../types';

export const QUEUE_NAME = 'emails';
export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, { connection: bullConnection });

/**
 * One delayed job per email row. The deterministic jobId makes enqueueing idempotent:
 * adding an id that already exists is a no-op, so reconcile can safely re-add everything.
 */
export async function enqueueEmails(rows: EmailRow[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const now = Date.now();
    await emailQueue.addBulk(
      rows.slice(i, i + CHUNK).map((r) => ({
        name: 'send',
        data: { emailId: r.id },
        opts: {
          jobId: `email-${r.id}`,
          delay: Math.max(0, r.scheduledAt.getTime() - now),
          attempts: env.MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400 },
        },
      })),
    );
  }
}
