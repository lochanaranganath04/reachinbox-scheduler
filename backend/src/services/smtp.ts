import nodemailer, { Transporter } from 'nodemailer';
import { attachmentRepo } from '../db/attachmentRepo';
import { htmlToText } from '../lib/html';
import type { EmailRow } from '../types';

const transports = new Map<string, Transporter>();

export async function sendEmail(row: EmailRow): Promise<{ messageId: string; previewUrl: string | null }> {
  const s = row.sender;
  let t = transports.get(s.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: false,
      auth: { user: s.user, pass: s.pass },
      pool: true,
    });
    transports.set(s.id, t);
  }
  const files = await attachmentRepo.forSending(row.campaignId);
  const info = await t.sendMail({
    from: `"${row.userName.replace(/"/g, '')}" <${s.email}>`,
    to: row.toEmail,
    subject: row.subject,
    html: row.body, // sanitized at schedule time
    text: htmlToText(row.body),
    attachments: files.map((f) => ({ filename: f.name, content: f.data, contentType: f.type })),
    // Deterministic id: a provider (or you) can dedupe if a crash ever causes a resend.
    messageId: `<${row.id}@reachinbox.local>`,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: preview || null };
}
