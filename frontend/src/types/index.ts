export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';
export type EmailView = 'scheduled' | 'sent';

export interface EmailItem {
  id: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderEmail: string;
  previewUrl: string | null;
  error: string | null;
  preview: string;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface EmailDetail extends EmailItem {
  fromName: string;
  html: string;
  attachments: AttachmentMeta[];
}

export interface SenderOption {
  id: string;
  email: string;
}

export interface AttachmentUpload {
  name: string;
  type: string;
  data: string;
}

export interface EmailListResponse {
  items: EmailItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Stats {
  scheduled: number;
  sent: number;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  channel: string | null;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  leads: string[];
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
  senderId?: string;
  attachments: AttachmentUpload[];
}

export interface ScheduleResponse {
  campaignId: string;
  count: number;
  skipped: number;
}
