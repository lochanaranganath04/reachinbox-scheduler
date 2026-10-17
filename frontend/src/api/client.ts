import type { EmailDetail, EmailListResponse, EmailView, ScheduleRequest, ScheduleResponse, SenderOption, SlackStatus, Stats, User } from '../types';

export const API_URL: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export interface ListParams {
  view: EmailView;
  page: number;
  q: string;
  status: string;
}

export const api = {
  me: () => request<User>('/auth/me'),
  login: (email: string, password: string) => post<User>('/auth/login', { email, password }),
  register: (email: string, password: string) => post<User>('/auth/register', { email, password }),
  logout: () => post<{ ok: true }>('/auth/logout', {}),
  stats: () => request<Stats>('/api/stats'),
  senders: () => request<SenderOption[]>('/api/senders'),
  emails: ({ view, page, q, status }: ListParams) => {
    const p = new URLSearchParams({ view, page: String(page), pageSize: '15' });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    return request<EmailListResponse>(`/api/emails?${p}`);
  },
  email: (id: string) => request<EmailDetail>(`/api/emails/${id}`),
  schedule: (body: ScheduleRequest) => post<ScheduleResponse>('/api/schedule', body),
  slack: () => request<SlackStatus>('/api/slack'),
  disconnectSlack: () => request<{ ok: true }>('/api/slack', { method: 'DELETE' }),
};

export const loginUrl = `${API_URL}/auth/google`;
export const slackConnectUrl = `${API_URL}/auth/slack/connect`;
export const attachmentUrl = (id: string) => `${API_URL}/api/attachments/${id}`;
