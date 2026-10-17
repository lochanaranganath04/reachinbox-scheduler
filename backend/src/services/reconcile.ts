import { emailRepo } from '../db/emailRepo';
import { enqueueEmails } from '../queue/emailQueue';

/**
 * Boot-time repair. Postgres is the source of truth; BullMQ ignores jobIds that already exist,
 * so re-adding every still-scheduled row only creates jobs that are actually missing.
 */
export async function reconcile(): Promise<void> {
  const released = await emailRepo.releaseStale(5);
  let cursor = 0;
  let total = 0;
  for (;;) {
    const rows = await emailRepo.scheduledAfterSeq(cursor, 500);
    if (rows.length === 0) break;
    await enqueueEmails(rows);
    cursor = rows[rows.length - 1].seq;
    total += rows.length;
  }
  console.log(`[reconcile] ensured ${total} scheduled jobs exist, released ${released} stale 'sending' rows`);
}
