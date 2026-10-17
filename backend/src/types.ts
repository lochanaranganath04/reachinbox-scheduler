export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface Sender {
  id: string;
  email: string;
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface EmailRow {
  id: string;
  seq: number;
  userId: string;
  campaignId: string;
  senderId: string;
  toEmail: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  status: EmailStatus;
  sentAt: Date | null;
  messageId: string | null;
  previewUrl: string | null;
  error: string | null;
  attempts: number;
  hourlyLimit: number;
  updatedAt: Date;
  userName: string;
  sender: Sender;
}

export interface EmailDto {
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

export interface EmailDetailDto extends EmailDto {
  fromName: string;
  html: string;
  attachments: AttachmentMeta[];
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface EmailJobData {
  emailId: string;
}
