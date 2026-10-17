import type { AttachmentMeta, EmailDetailDto, EmailDto, EmailRow } from '../types';
import { makePreview } from './html';

export function toDto(r: EmailRow): EmailDto {
  const processed = r.sentAt ?? (r.status === 'failed' ? r.updatedAt : null);
  return {
    id: r.id,
    toEmail: r.toEmail,
    subject: r.subject,
    status: r.status,
    scheduledAt: r.scheduledAt.toISOString(),
    sentAt: processed ? processed.toISOString() : null,
    senderEmail: r.sender.email,
    previewUrl: r.previewUrl,
    error: r.error,
    preview: makePreview(r.body),
  };
}

export const toDetailDto = (r: EmailRow, attachments: AttachmentMeta[]): EmailDetailDto => ({
  ...toDto(r),
  fromName: r.userName,
  html: r.body,
  attachments,
});
