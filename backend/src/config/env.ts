import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BACKEND_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTIC_NODE: z.string().default('http://localhost:9200'),
  JWT_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default(''),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  SENDER_COUNT: z.coerce.number().int().min(1).default(3),
  ETHEREAL_ACCOUNTS: z.string().default(''),
  RUN_WORKER: z.enum(['true', 'false']).default('true'),
  BULL_BOARD_USER: z.string().default(''),
  BULL_BOARD_PASS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
