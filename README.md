# ReachInbox Email Job Scheduler

A production-style email scheduler and dashboard built for the ReachInbox hiring assignment. You give it recipients, a message, a start time and throttling settings. It stores every email, schedules each one with **BullMQ delayed jobs on Redis (no cron anywhere)**, and sends it at the right time through **Ethereal SMTP** from multiple senders. It applies per-sender hourly limits, alerts Slack when a limit is hit, and survives restarts without losing or duplicating emails.

| | |
|---|---|
| **Demo video** | https://drive.google.com/file/d/1FabBk0zi_wagD32OkCfPciL6zE3hzmPy/view?usp=sharing |
| **Live site** | https://reachinbox-scheduler-production-4835.up.railway.app/|
| **Author** | `LOCHANA RANGANATH` |

---

## Table of contents

1. [Tech stack](#1-tech-stack)
2. [Project structure](#2-project-structure)
3. [Running it locally](#3-running-it-locally)
4. [Configuration](#4-configuration)
5. [Architecture](#5-architecture)
6. [API reference](#6-api-reference)
7. [Features implemented](#7-features-implemented)
8. [Testing the system](#8-testing-the-system)
9. [Assumptions, shortcuts and trade-offs](#9-assumptions-shortcuts-and-trade-offs)
10. [Deploying](#10-deploying)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | Node.js, Express, **TypeScript** | API, auth, scheduling logic |
| Queue | **BullMQ** on **Redis** | Delayed jobs, worker, concurrency, limiter |
| Database | **PostgreSQL** (`pg` driver, parameterized SQL) | Source of truth for users, senders, campaigns and emails |
| Search | **Elasticsearch 8** | Full-text search over emails (Postgres `ILIKE` fallback) |
| SMTP | **Ethereal** via Nodemailer | Fake SMTP with preview links |
| Auth | Google OAuth 2.0, email/password (scrypt) | Sign-in with an httpOnly session cookie |
| Alerts | Slack OAuth (incoming webhook) | Rate-limit notifications |
| Queue UI | Bull Board | Live queue dashboard at `/admin/queues` |
| Frontend | **React 18**, Vite, **TypeScript**, **Tailwind CSS**, React Router | Dashboard, compose and detail screens |
| Infra | Docker Compose, Dockerfile | Local services and single-container deploy |

---

## 2. Project structure

```
reachinbox-scheduler/
├── docker-compose.yml        Postgres, Redis (AOF on), Elasticsearch
├── Dockerfile                Builds frontend + backend into one image
├── backend/
│   └── src/
│       ├── config/           env parsing and validation (zod)
│       ├── db/               pool, migrations, repositories
│       ├── queue/            Redis connection, BullMQ queue
│       ├── workers/          email.worker.ts (the sending worker)
│       ├── services/         schedule, reconcile, smtp, search, slack, senders
│       ├── routes/           auth.ts, api.ts
│       ├── middleware/       session auth, Bull Board basic auth
│       ├── lib/              html sanitizing, DTOs, time helpers
│       ├── scripts/load.ts   load simulation
│       ├── app.ts            Express app (+ serves the built frontend in production)
│       ├── server.ts         API + embedded worker entry point
│       └── worker.ts         standalone worker entry point
└── frontend/
    └── src/
        ├── api/              typed API client
        ├── components/       layout, sidebar, reusable UI (Button, Menu, Toast, Badge…)
        ├── features/         compose (editor, recipients, send-later), emails, slack
        ├── hooks/            useAuth, useEmails, useStats, useStars, useDebounce
        ├── pages/            Login, Inbox, Compose, EmailDetail
        ├── lib/              formatting and parsing helpers
        └── types/            shared TypeScript interfaces
```

---

## 3. Running it locally

**Prerequisites:** Node.js 18+ (20 recommended), Docker Desktop, Git.

### 3.1 Start Postgres, Redis and Elasticsearch

```bash
docker compose up -d
docker compose ps        # all three should be "running"
```

Elasticsearch needs roughly a minute before it answers on `http://localhost:9200`.
Redis starts with **append-only persistence** (`appendonly yes`) so queued jobs survive a Redis restart.

### 3.2 Backend (API + BullMQ worker)

```bash
cd backend
cp .env.example .env          # Windows PowerShell: copy .env.example .env
# edit .env, see section 4
npm install
npm run dev                   # http://localhost:4000
```

A healthy start logs, in order: Ethereal accounts created, `[reconcile] ensured N scheduled jobs…`, `[worker] started: concurrency=5, min delay=2000ms`, `[api] listening on :4000`.

The worker runs inside the API process by default. To run workers separately (horizontal scaling), set `RUN_WORKER=false` on the API and start `npm run worker` on as many machines as you like. The hourly counters and the minimum delay live in Redis, so they hold across every instance.

### 3.3 Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Always open **`http://localhost:5173`** (not `127.0.0.1`). Vite proxies `/api` and `/auth` to the backend so the session cookie is same-origin.

### 3.4 Useful URLs

| URL | What |
|---|---|
| `http://localhost:5173` | Dashboard |
| `http://localhost:4000/admin/queues` | Bull Board (live queue view) |
| `http://localhost:4000/health` | Health check |

### 3.5 Production build

```bash
cd backend  && npm run build && npm start
cd frontend && npm run build
```

---

## 4. Configuration

### 4.1 Ethereal (fake SMTP)

Two options:

1. **Automatic (default).** On first boot the backend calls `nodemailer.createTestAccount()` until `SENDER_COUNT` accounts exist and stores them in the `senders` table. Needs internet access once.
2. **Bring your own.** Create accounts at https://ethereal.email/create and set `ETHEREAL_ACCOUNTS=user1@ethereal.email:pass1,user2@ethereal.email:pass2`. They are upserted on boot.

Every sent email stores an Ethereal **preview URL**, shown on the email detail page.

### 4.2 Google OAuth (login)

1. Google Cloud Console → *APIs & Services* → *OAuth consent screen* → External, and add your Gmail as a **test user**.
2. *Credentials* → *Create credentials* → *OAuth client ID* → Web application.
3. Authorized redirect URI: `http://localhost:4000/auth/google/callback`.
4. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 4.3 Slack OAuth (rate-limit alerts)

1. Run a tunnel, because Slack requires an HTTPS redirect URL: `ngrok http 4000`. A free ngrok URL **changes every restart**, so update the values below whenever it does.
2. https://api.slack.com/apps → *Create New App* → From scratch.
3. Enable *Incoming Webhooks*. Under *OAuth & Permissions* add the redirect URL `https://<tunnel>/auth/slack/callback`.
4. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_REDIRECT_URI=https://<tunnel>/auth/slack/callback`, then restart the backend.
5. In the dashboard open the user menu → **Connect Slack**, choose a channel, and a confirmation message is posted immediately.

### 4.4 Environment variables (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `FRONTEND_URL` / `BACKEND_URL` | `http://localhost:5173` / `http://localhost:4000` | Redirect targets after OAuth and CORS origin |
| `DATABASE_URL` | none (required) | Postgres connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis for BullMQ and counters |
| `ELASTIC_NODE` | `http://localhost:9200` | Elasticsearch. Empty disables it (search falls back to Postgres) |
| `JWT_SECRET` | none (required, 16+ chars) | Signs session cookies and OAuth state |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Google login |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_REDIRECT_URI` | empty | Slack connect |
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker process |
| `MIN_DELAY_MS` | **`2000`** | Minimum gap between any two sends, queue-wide |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Hard ceiling per sender per hour |
| `MAX_ATTEMPTS` | `3` | Send attempts (exponential backoff, 5 s base) |
| `SENDER_COUNT` | `3` | Number of auto-created Ethereal senders |
| `ETHEREAL_ACCOUNTS` | empty | Optional `user:pass,user:pass` list |
| `RUN_WORKER` | `true` | Run the worker inside the API process |
| `BULL_BOARD_USER` / `BULL_BOARD_PASS` | empty | Optional basic auth for `/admin/queues` |

**Chosen minimum delay between sends: 2 seconds** (`MIN_DELAY_MS=2000`).

> For demos it is convenient to lower `MAX_EMAILS_PER_HOUR_PER_SENDER` (for example to `2`) so rate limiting is visible quickly. Restore `200` for normal use.

---

## 5. Architecture

```
React ──► Express API ──► PostgreSQL   (source of truth)
              │  └──────► Elasticsearch (search index)
              ▼
        BullMQ queue "emails"  (Redis, AOF persistence)
              ▼
        Worker(s): limiter + concurrency + per-sender hourly counter (Redis Lua)
              ▼
        Ethereal SMTP ─────► Slack webhook (when a sender hits its limit)
```

### 5.1 How scheduling works

1. `POST /api/schedule` receives subject, body, leads, start time, delay between emails, hourly limit, optional sender and attachments.
2. The request is validated (zod). Leads are lower-cased, validated and de-duplicated. The body is sanitized to safe HTML. The start time is clamped so it can never be in the past, and the hourly limit is clamped to `MAX_EMAILS_PER_HOUR_PER_SENDER`.
3. Each email gets `scheduled_at = start + index × delay` and a sender assigned round-robin (or the single sender chosen).
4. In **one database transaction** the campaign, its attachments and one `email_jobs` row per lead are inserted (bulk `unnest` insert). All or nothing.
5. After the commit, one BullMQ **delayed job** per row is added with `jobId = email-<rowId>` and `delay = scheduled_at − now`.
6. The emails are indexed in Elasticsearch (best effort, never blocks scheduling).
7. When a job's time arrives, BullMQ moves it to the wait list and a worker sends it.

Nothing polls and nothing runs on a timer: Redis holds each job in a sorted set scored by its due time. There is no cron, no `node-cron` and no `agenda`.

### 5.2 What the worker does for each job

1. Load the row. If its status is not `scheduled` (already sent, failed, or being sent by another worker) the job finishes without doing anything.
2. Take an hourly slot for this sender (see 5.4). If the limit is reached, defer the job (it is never failed or dropped).
3. Atomically claim the row: `UPDATE … SET status='sending' WHERE id=$1 AND status='scheduled'`. Only one worker can win.
4. Send through the sender's Ethereal SMTP account with a deterministic `Message-ID` and any attachments.
5. On success, mark the row `sent`, store the message ID and preview URL, and re-index it. On failure, return the counter slot. If it was the last attempt, mark the row `failed`; otherwise set it back to `scheduled`. Then rethrow so BullMQ retries with exponential backoff.

### 5.3 Persistence on restart

- **Redis runs with AOF** (`appendonly yes`), so delayed jobs are on disk. Restarting the API or worker changes nothing because jobs are not held in process memory.
- **Postgres is the source of truth.** On every boot `reconcile()` (a) resets rows stuck in `sending` for more than 5 minutes (a worker that died mid-send) back to `scheduled`, and (b) re-adds a job for every row still `scheduled`.
- Because job IDs are deterministic, BullMQ ignores IDs that already exist. Reconcile is therefore a no-op for healthy jobs and a repair for jobs lost from Redis, for example after a flush.
- Emails already `sent` are never touched, and future ones keep their original `scheduled_at`. Nothing restarts from scratch.

### 5.4 Idempotency (no duplicate sends)

Four layers:

1. **Enqueue:** deterministic `jobId` means the same row cannot be queued twice.
2. **Atomic claim:** the conditional `UPDATE` in 5.2 lets exactly one worker take an email.
3. **Status check:** every job exits immediately unless its row is `scheduled`.
4. **Deterministic `Message-ID`** (`<rowId@reachinbox.local>`), so a downstream system can de-duplicate.

### 5.5 Concurrency and minimum delay

- `Worker({ concurrency: WORKER_CONCURRENCY })` runs jobs in parallel. This is safe because of the atomic claim and the Lua counter.
- `limiter: { max: 1, duration: MIN_DELAY_MS }` is BullMQ's Redis-backed limiter. It is **queue-wide**, so the minimum gap between sends holds across every worker and instance, not just per process.

### 5.6 Hourly rate limit

- Counter key: `rl:<senderId>:<YYYY-MM-DDTHH>` using the **UTC** hour, with a 2-hour TTL.
- A small **Lua script** increments the counter and, if it exceeds the cap, decrements it again and rejects. It runs atomically inside Redis, so concurrent workers cannot overshoot.
- The effective cap per sender is `min(hourly limit from the compose form, MAX_EMAILS_PER_HOUR_PER_SENDER)`.
- **When the cap is reached, the job is not dropped or failed.** The worker sets the row's `scheduled_at` to the start of the next UTC hour plus a small offset (`seq % 1000` ms), then calls `job.moveToDelayed(...)` and throws `DelayedError`. The offset keeps overflow jobs in roughly their original order, because BullMQ breaks timestamp ties in insertion order. The dashboard shows the new time.
- A failed send gives its counter slot back, so errors do not use up quota.
- UTC windows mean that in a +05:30 time zone (India) the "next hour" rolls over at **:30 past the local hour**. A deferred email showing 3:30 PM is expected.

### 5.7 Behavior under load (1000+ emails at once)

- Scheduling is two round trips: one bulk insert and chunked `addBulk` calls of 500.
- The queue-wide limiter releases them one per `MIN_DELAY_MS`, however many are due at the same instant.
- Each sender's counter caps it per hour, and the overflow rolls into the next hour windows without loss.
- Try it: `cd backend && npm run load -- 1000` schedules 1000 emails for the first user, starting 10 seconds from now, with a 50 per hour cap, and you can watch Bull Board.

### 5.8 Slack notifications

- Real OAuth: Connect Slack → `/auth/slack/connect` → Slack → `/auth/slack/callback`. The incoming-webhook URL is stored per user.
- When a sender's cap is hit, the worker looks up the owning user's webhook **at that moment** and posts a message. A Redis `SET NX` key per user, sender and hour guarantees one alert per sender per hour.
- No connection means the alert is skipped silently, with no crash. Connecting later works immediately with no redeploy. `DELETE /api/slack` disconnects.
- The alert fires when the first email beyond the limit is rejected, not when the last allowed email is sent. A sender given exactly as many emails as its limit will not trigger an alert.

### 5.9 Search

Every email is indexed into the Elasticsearch `emails` index when scheduled, and re-indexed when it is sent, fails or is rescheduled. `GET /api/emails?view=…&q=term` searches recipient, subject and body (fuzzy match). If Elasticsearch is down or disabled, the same endpoint falls back to a Postgres `ILIKE` search.

### 5.10 Data model

`users` · `senders` · `slack_connections` · `campaigns` · `campaign_attachments` · `email_jobs` (status: `scheduled` → `sending` → `sent` / `failed`). The schema is created automatically on startup.

---

## 6. API reference

All `/api/*` routes need the session cookie.

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/google`, `/auth/google/callback` | Google sign-in |
| POST | `/auth/register`, `/auth/login` | Email and password sign-in |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Clear the session |
| GET | `/auth/slack/connect`, `/auth/slack/callback` | Slack OAuth |
| POST | `/api/schedule` | Schedule a campaign (body below) |
| GET | `/api/emails?view=scheduled\|sent&status=&q=&page=&pageSize=` | Lists, filterable and searchable |
| GET | `/api/emails/:id` | Email detail with attachments |
| GET | `/api/attachments/:id` | Download an attachment |
| GET | `/api/stats` | Counts for the sidebar |
| GET | `/api/senders` | Sender accounts for the From picker |
| GET, DELETE | `/api/slack` | Slack connection status, disconnect |
| GET | `/admin/queues` | Bull Board |
| GET | `/health` | Health check |

`POST /api/schedule`:

```json
{
  "subject": "Hello",
  "body": "<p>Hi there</p>",
  "leads": ["a@example.com", "b@example.com"],
  "startTime": "2026-10-18T09:00:00.000Z",
  "delaySeconds": 5,
  "hourlyLimit": 50,
  "senderId": "optional-uuid-to-use-one-sender",
  "attachments": [{ "name": "file.png", "type": "image/png", "data": "<base64>" }]
}
```

`body` may be rich-text HTML or plain text. Plain text is converted for you.

---

## 7. Features implemented

### Backend

| Area | Implementation |
|---|---|
| Scheduler | Bulk validation, transactional insert, BullMQ delayed jobs, no cron |
| Persistence | Redis AOF, Postgres source of truth, boot-time reconcile, stale-`sending` recovery |
| Idempotency | Deterministic job ID, atomic claim, status guard, deterministic `Message-ID` |
| Concurrency | Configurable worker concurrency, safe parallel processing |
| Delay | Queue-wide BullMQ limiter, 2 s default |
| Rate limiting | Per-sender hourly Redis Lua counter, multi-instance safe, overflow deferred to the next hour |
| Slack | Real OAuth, per-user webhook, alert on limit, once per sender per hour, disconnect and reconnect safe |
| Search | Elasticsearch indexing and search with a Postgres fallback |
| Queue visibility | Bull Board at `/admin/queues` with optional basic auth |
| Senders | Multiple Ethereal senders, round-robin or a single chosen sender |
| Reliability | Retries with exponential backoff, `failed` status with error message |
| Auth | Google OAuth and email/password, httpOnly session cookie |
| Extras | Rich-text bodies sanitized server-side, attachments (up to 5 files / 5 MB), load script |

### Frontend

| Area | Implementation |
|---|---|
| Login | Google OAuth plus email/password sign-up and login |
| Dashboard | Sidebar with user name, email, avatar, Logout, Compose button, Scheduled and Sent with live counts |
| Scheduled list | Recipient, subject and preview, scheduled-time pill, status. Loading, empty and error states |
| Sent list | Recipient, subject, sent time, status (`sent` / `failed`). Loading, empty and error states |
| List tools | Search, status filter, refresh, pagination, 5 second live refresh, favourites |
| Email detail | Sender header, sanitized HTML body, attachments, Ethereal preview link |
| Compose | Sender picker, recipient chips with upload of CSV/text lists and a detected-address count, subject, delay, hourly limit, rich-text editor, attachments, Send Later popover |
| Quality | Reusable components, typed API layer and props, toasts, debounced search |
| Slack | Connect and disconnect from the user menu |

The UI follows the Figma screens supplied with the assignment (login, inbox, detail, compose, send-later).

---

## 8. Testing the system

There is no automated test suite. These manual scenarios cover the assignment requirements. The SQL checks use `docker compose exec postgres psql -U reachinbox -d reachinbox -c "<SQL>"`.

| # | Scenario | How | Expected |
|---|---|---|---|
| 1 | Schedule and send | Compose with a CSV of 10 leads, delay 2 s, start 2 minutes ahead | 10 scheduled rows, 10 delayed jobs in Bull Board, then they move to Sent roughly 2 s apart from rotating senders |
| 2 | Restart safety | Schedule emails a few minutes ahead, stop the backend, start it again | `[reconcile]` line on boot, emails still send on time |
| 3 | No duplicates | After test 2 run `select count(*), count(distinct message_id) from email_jobs where status='sent';` | Both numbers are equal |
| 4 | Redis wipe recovery | `docker compose exec redis redis-cli FLUSHALL`, restart the backend | Reconcile rebuilds the jobs from Postgres |
| 5 | Hourly limit | Set the cap low (for example 2), send 10 emails across senders | Each sender sends at most 2, the rest show next-hour times and appear in Delayed, none `failed` |
| 6 | Slack alert | Connect Slack, trigger test 5 | One message per limited sender in your channel |
| 7 | Slack disconnect and reconnect | Disconnect, trigger a limit (no message, no error), reconnect, trigger again | Message arrives without a redeploy |
| 8 | Load | `npm run load -- 300` | Bull Board drains about one job per 2 s and senders stop at their cap |
| 9 | Search | Search a recipient or subject in the UI, and `curl localhost:9200/emails/_count` | Matching emails shown, index has documents |
| 10 | Search fallback | Stop the Elasticsearch container and search again | Results still returned (Postgres fallback) |

Per-sender check for test 5:

```sql
select s.email, e.status, count(*)
from email_jobs e join senders s on s.id = e.sender_id
group by 1, 2 order by 1, 2;
```

---

## 9. Assumptions, shortcuts and trade-offs

- **Send-then-crash window.** If a worker dies after SMTP accepts a message but before the database is updated, the row stays `sending` and the stale reset (5 minutes) can resend it. Exactly-once delivery is impossible with SMTP. The deterministic `Message-ID` is the mitigation.
- **Stuck `sending` rows** are only recovered on the next boot. A periodic reconcile would heal them while running.
- **Enqueue happens after the DB commit.** Postgres and Redis cannot share a transaction. If the enqueue fails, the rows stay `scheduled` and the next reconcile picks them up.
- **Overflow order is best-effort.** Deferred jobs keep roughly their original order (same-timestamp tie-break), not a strict one.
- **The limiter is queue-wide, not per sender.** Per-sender throughput is governed by the hourly counter.
- **Delay and multiple senders.** `scheduled_at` is spaced per campaign, so with N senders each sender is used every N × delay.
- **Hour windows are UTC clock hours**, not rolling 60-minute windows. Cheap, atomic and predictable.
- **Slack alert timing.** The alert is sent when the first over-limit email is rejected, not when the final allowed email goes out.
- **The hourly limit counter is shared per sender**, while each job is checked against its own campaign's limit.
- **Empty compose fields.** An empty delay means 0 seconds. An empty hourly limit means no extra limit beyond the server cap.
- **Ethereal credentials** are stored in plaintext in Postgres. They are throwaway test accounts. Use a secret manager for real SMTP.
- **Attachments** are stored once per campaign in Postgres (`bytea`). Fine at this scale, use object storage for large files.
- **Rich text** uses `contentEditable` / `execCommand` (deprecated but universally supported) and is sanitized on the server and again on display.
- **Email/password auth** is minimal: scrypt hashes, no verification email or password reset. Google OAuth is the main login.
- **Data access** uses `pg` with parameterized SQL, which gives direct control over the atomic claim and bulk inserts.
- **Favourites (stars)** are stored per browser, not in the database.
- **Elasticsearch is eventually consistent** and best effort. Postgres stays authoritative.
- **Reconcile runs at boot only.**
- **No automated tests.** The manual scenarios in section 8 and the load script are the verification tools.

---

## 10. Deploying

GitHub stores code but does not run it. The root `Dockerfile` builds the React app and serves it from Express, so the UI, API and worker are one deployable service.

1. Create a web service from the `Dockerfile`, plus Postgres, Redis (persistence on, `maxmemory-policy noeviction`) and optionally hosted Elasticsearch. Render, Railway and Fly.io all work.
2. Use an **always-on** instance. A service that sleeps when idle will not fire delayed jobs while it sleeps.
3. Set the variables from section 4.4, plus `NODE_ENV=production` and `BACKEND_URL` / `FRONTEND_URL` both set to your public URL (same origin).
4. Add `https://<your-domain>/auth/google/callback` in Google Cloud. Add reviewers as test users if the consent screen is in Testing mode.
5. Set `SLACK_REDIRECT_URI=https://<your-domain>/auth/slack/callback` and add it in the Slack app. No tunnel is needed on an HTTPS domain.
6. Protect Bull Board with `BULL_BOARD_USER` and `BULL_BOARD_PASS`.

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `Invalid environment configuration` | A required `.env` value is missing. `JWT_SECRET` needs 16+ characters |
| `ECONNREFUSED` on 5432, 6379 or 9200 | Run `docker compose up -d` and check `docker compose ps` |
| Port already in use | Another program holds 5432, 6379, 9200, 4000 or 5173. Close it or change the port |
| Elasticsearch container exits | Give Docker at least 4 GB of memory. On Linux run `sudo sysctl -w vm.max_map_count=262144` |
| Google `redirect_uri_mismatch` | The redirect URI must exactly match `BACKEND_URL` + `/auth/google/callback` |
| Google "access blocked" | Add your account as a test user on the consent screen |
| Slack `invalid redirect_uri` | Free ngrok URLs change on restart. Update `.env` and the Slack app, then restart the backend |
| Slack connected but no alert | Alerts are sent once per sender per hour. Use a different sender or clear the Redis keys |
| Login loops | You mixed `localhost` and `127.0.0.1`. Use `localhost` throughout |
| Deferred emails show `:30` times | Expected in +05:30 time zones. UTC hour windows start at :30 local time |

Useful checks:

```bash
docker compose exec redis redis-cli --scan --pattern "rl:*"        # hourly counters
docker compose exec redis redis-cli CONFIG GET appendonly          # should be "yes"
curl localhost:9200/emails/_count                                  # indexed documents
```
