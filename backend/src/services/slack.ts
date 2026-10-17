import { env } from '../config/env';
import { redis } from '../queue/connection';
import { userRepo } from '../db/userRepo';

const post = async (url: string, text: string) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}`);
};

/**
 * Called when a sender hits its hourly cap. Never throws.
 * No Slack connection => silently skipped. One alert per sender per hour window (SET NX).
 */
export async function notifyRateLimit(userId: string, senderEmail: string, senderId: string, limit: number, window: string): Promise<void> {
  try {
    const conn = await userRepo.getSlack(userId);
    if (!conn) return;
    const first = await redis.set(`slack-notified:${userId}:${senderId}:${window}`, '1', 'EX', 7200, 'NX');
    if (first !== 'OK') return;
    await post(
      conn.webhookUrl,
      `:warning: *ReachInbox rate limit reached*\nSender \`${senderEmail}\` hit its hourly limit of *${limit}* emails (window ${window}:00 UTC). ` +
        `Remaining emails were rescheduled to the next hour, nothing was dropped.`,
    );
  } catch (err) {
    console.warn('[slack] notify failed:', (err as Error).message);
  }
}

export const slackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);

export function slackAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${p}`;
}

export async function slackExchange(code: string): Promise<{ webhookUrl: string; teamName: string | null; channel: string | null }> {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  const data: any = await res.json();
  if (!data.ok || !data.incoming_webhook?.url) throw new Error(`Slack OAuth failed: ${data.error ?? 'no webhook returned'}`);
  return { webhookUrl: data.incoming_webhook.url, teamName: data.team?.name ?? null, channel: data.incoming_webhook.channel ?? null };
}

export async function sendSlackWelcome(webhookUrl: string): Promise<void> {
  await post(webhookUrl, ':white_check_mark: ReachInbox is connected. You will be notified here when a sender hits its hourly limit.');
}
