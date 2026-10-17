import IORedis from 'ioredis';
import { env } from '../config/env';

const u = new URL(env.REDIS_URL);

/** Connection options handed to BullMQ (it creates its own connections). */
export const bullConnection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  username: u.username || undefined,
  password: u.password ? decodeURIComponent(u.password) : undefined,
  tls: u.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null as null,
};

/** General-purpose client: rate-limit counters, notification dedupe keys. */
export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
