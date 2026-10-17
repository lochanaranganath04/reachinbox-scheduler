import { pool } from './pool';
import type { AttachmentMeta } from '../types';

export interface AttachmentData {
  name: string;
  type: string;
  data: Buffer;
}

const cache = new Map<string, AttachmentData[]>(); // tiny cache: a campaign's workers re-send the same files

export const attachmentRepo = {
  async insert(client: { query: (q: string, p: unknown[]) => Promise<unknown> }, campaignId: string, files: (AttachmentData & { size: number })[]) {
    for (const f of files) {
      await client.query(
        'INSERT INTO campaign_attachments (campaign_id, name, content_type, size, data) VALUES ($1,$2,$3,$4,$5)',
        [campaignId, f.name, f.type, f.size, f.data],
      );
    }
  },

  async meta(campaignId: string): Promise<AttachmentMeta[]> {
    const { rows } = await pool.query('SELECT id, name, content_type, size FROM campaign_attachments WHERE campaign_id = $1 ORDER BY name', [campaignId]);
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.content_type, size: r.size }));
  },

  async forSending(campaignId: string): Promise<AttachmentData[]> {
    const hit = cache.get(campaignId);
    if (hit) return hit;
    const { rows } = await pool.query('SELECT name, content_type, data FROM campaign_attachments WHERE campaign_id = $1', [campaignId]);
    const files = rows.map((r) => ({ name: r.name, type: r.content_type, data: r.data as Buffer }));
    if (cache.size >= 3) cache.delete(cache.keys().next().value as string);
    cache.set(campaignId, files);
    return files;
  },

  async get(id: string, userId: string): Promise<AttachmentData | null> {
    const { rows } = await pool.query(
      `SELECT a.name, a.content_type, a.data FROM campaign_attachments a JOIN campaigns c ON c.id = a.campaign_id
       WHERE a.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    return rows[0] ? { name: rows[0].name, type: rows[0].content_type, data: rows[0].data } : null;
  },
};
