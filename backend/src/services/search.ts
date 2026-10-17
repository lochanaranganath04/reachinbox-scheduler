import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { emailRepo, View, pick } from '../db/emailRepo';
import { toDto } from '../lib/dto';
import type { EmailDto, EmailRow } from '../types';

const INDEX = 'emails';
const client = env.ELASTIC_NODE ? new Client({ node: env.ELASTIC_NODE }) : null;
let healthy = false;

export async function ensureIndex(): Promise<void> {
  if (!client) return;
  try {
    const exists = await client.indices.exists({ index: INDEX });
    if (!exists) {
      await client.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            status: { type: 'keyword' },
            toEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            senderEmail: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
          },
        },
      });
    }
    healthy = true;
  } catch (err) {
    healthy = false;
    console.warn('[search] Elasticsearch unavailable, falling back to SQL search:', (err as Error).message);
  }
}

const doc = (r: EmailRow) => ({ ...toDto(r), userId: r.userId, body: r.body });

/** Best-effort: indexing must never break scheduling or sending. */
export async function indexEmail(row: EmailRow): Promise<void> {
  if (!client || !healthy) return;
  try {
    await client.index({ index: INDEX, id: row.id, document: doc(row) });
  } catch (err) {
    console.warn('[search] index failed:', (err as Error).message);
  }
}

export async function indexEmails(rows: EmailRow[]): Promise<void> {
  if (!client || !healthy || rows.length === 0) return;
  try {
    const operations = rows.flatMap((r) => [{ index: { _index: INDEX, _id: r.id } }, doc(r)]);
    await client.bulk({ operations });
  } catch (err) {
    console.warn('[search] bulk index failed:', (err as Error).message);
  }
}

export async function searchEmails(
  userId: string,
  view: View,
  q: string,
  page: number,
  pageSize: number,
  status?: string,
): Promise<{ items: EmailDto[]; total: number }> {
  if (client && healthy) {
    try {
      const res = await client.search({
        index: INDEX,
        from: (page - 1) * pageSize,
        size: pageSize,
        track_total_hits: true,
        sort: [{ scheduledAt: { order: 'asc' } }],
        query: {
          bool: {
            filter: [{ term: { userId } }, { terms: { status: pick(view, status) } }],
            must: [{ multi_match: { query: q, fields: ['toEmail^2', 'subject', 'body'], fuzziness: 'AUTO' } }],
          },
        },
      });
      const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
      const items = res.hits.hits.map((h) => {
        const { userId: _u, body: _b, ...dto } = h._source as any;
        return dto as EmailDto;
      });
      return { items, total };
    } catch (err) {
      console.warn('[search] query failed, using SQL fallback:', (err as Error).message);
    }
  }
  const r = await emailRepo.searchSql(userId, view, q, pageSize, (page - 1) * pageSize, status);
  return { items: r.items.map(toDto), total: r.total };
}
