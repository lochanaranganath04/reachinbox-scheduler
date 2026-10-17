# ReachInbox Email Job Scheduler

A production-style email scheduler service + dashboard: schedule bulk sends through an API, deliver them at the right time with **BullMQ delayed jobs on Redis (no cron anywhere)**, survive restarts without losing or duplicating mail, throttle per sender, and watch it all in a React dashboard.

```
/backend    Express + TypeScript + BullMQ + Postgres + Elasticsearch + Ethereal SMTP
/frontend   React + Vite + TypeScript + Tailwind
docker-compose.yml   Postgres, Redis (AOF persistence on), Elasticsearch
```

---

## 1. Quick start

**Prerequisites:** Node 18+, Docker.

```bash
# 1. Infra (Postgres :5432, Redis :6379, Elasticsearch :9200)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # fill in the values described in section 2
npm install
npm run dev                 # API + embedded worker on :4000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env        # optional, defaults work with the Vite proxy
npm install
npm run dev                 # http://localhost:5173
```

Useful URLs: dashboard `http://localhost:5173`, BullMQ dashboard `http://localhost:4000/admin/queues`, health `http://localhost:4000/health`.

**Running the worker as a separate process** (scale horizontally): set `RUN_WORKER=false` on the API and run `npm run worker` on as many machines as you like. Rate limits and the min delay are Redis-backed, so they hold across all of them.

**Production build:** `npm run build && npm start` (backend), `npm run build` (frontend, serve `dist/`; set `VITE_API_URL` if the API is on another origin).

---

## 2. Configuration

### 2.1 Ethereal Email (fake SMTP)
Two options:

1. **Automatic (default).** On first boot the backend calls `nodemailer.createTestAccount()` until `SENDER_COUNT` Ethereal accounts exist, and stores them in the `senders` table. Nothing to do.
2. **Bring your own.** Create accounts at https://ethereal.email/create and set
   `ETHEREAL_ACCOUNTS=user1@ethereal.email:pass1,user2@ethereal.email:pass2`.
   They are upserted on boot.

Every sent email stores an Ethereal **preview URL**, which the Sent tab links to.

### 2.2 Google OAuth (login)
1. Google Cloud Console > APIs & Services > Credentials > *OAuth client ID* (Web application).
2. Authorized redirect URI: `http://localhost:4000/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### 2.3 Slack OAuth (rate-limit alerts)
1. https://api.slack.com/apps > *Create New App* > From scratch.
2. *OAuth & Permissions* > Redirect URL. **Slack requires HTTPS**, so expose the backend with a tunnel (`ngrok http 4000` or `cloudflared tunnel --url http://localhost:4000`) and add `https://<tunnel>/auth/slack/callback`.
3. Add the scope `incoming-webhook` (bot/user scopes are not needed).
4. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI=https://<tunnel>/auth/slack/callback`.
5. In the dashboard click **Connect Slack**, pick a channel, and a confirmation message is posted immediately.

### 2.4 Environment variables (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 4000 | API port |
| `FRONTEND_URL` / `BACKEND_URL` | localhost:5173 / localhost:4000 | Redirect targets and CORS origin |
| `DATABASE_URL` | none | Postgres connection string |
| `REDIS_URL` | redis://localhost:6379 | Redis for BullMQ and counters |
| `ELASTIC_NODE` | http://localhost:9200 | Elasticsearch. Empty disables it (search falls back to Postgres) |
| `JWT_SECRET` | none | 16+ chars, signs session cookies and OAuth state |
| `GOOGLE_CLIENT_ID/SECRET` | none | Google login |
| `SLACK_CLIENT_ID/SECRET/REDIRECT_URI` | none | Slack connect |
| `WORKER_CONCURRENCY` | 5 | Parallel jobs per worker process |
| `MIN_DELAY_MS` | **2000** | Minimum gap between any two sends (queue-wide) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 | Hard ceiling per sender per hour |
| `MAX_ATTEMPTS` | 3 | Send retries (exponential backoff, 5s base) |
| `SENDER_COUNT` | 3 | Number of auto-created Ethereal senders |
| `RUN_WORKER` | true | Run the worker inside the API process |
| `BULL_BOARD_USER/PASS` | none | Optional basic auth for `/admin/queues` |

**Chosen delay: minimum 2 seconds between sends** (`MIN_DELAY_MS=2000`).

---

## 3. Architecture

```
React ──► Express API ──► Postgres  (source of truth: email_jobs, senders, users…)
              │  └──────► Elasticsearch (searchable index)
              ▼
         BullMQ queue "emails" (Redis, AOF on)
              ▼
         Worker(s): limiter + concurrency + per-sender hourly counter (Redis Lua)
              ▼
         Ethereal SMTP ──► Slack webhook (when a sender hits its limit)
```

### 3.1 How scheduling works
1. `POST /api/schedule` receives subject, body, leads, `startTime`, `delaySeconds`, `hourlyLimit`.
2. In **one DB transaction** it inserts a `campaigns` row and one `email_jobs` row per lead: `scheduled_at = start + i * delay`, sender assigned round-robin.
3. After commit it enqueues one BullMQ **delayed job** per row with `delay = scheduled_at - now` and `jobId = email-<rowId>`.
4. Emails are indexed into Elasticsearch (best-effort, never blocks scheduling).
5. At the due time BullMQ moves the job to the wait list and a worker sends it via the sender's Ethereal SMTP transport.

No cron, no polling loop and no `setInterval` drives sending. Redis sorted sets hold the delayed jobs.

### 3.2 Persistence on restart
- **Redis runs with AOF** (`appendonly yes`, fsync every second), so delayed jobs are on disk. Restarting the API/worker changes nothing: jobs are in Redis, not in process memory.
- **Postgres is the source of truth.** On boot `reconcile()` (a) resets rows stuck in `sending` for over 5 minutes (worker died mid-send) back to `scheduled`, and (b) re-adds jobs for every `scheduled` row via `addBulk`. Because `jobId` is deterministic, BullMQ ignores ids that already exist, so reconcile is a safe no-op for healthy jobs and a repair for jobs lost from Redis (e.g. a Redis flush).
- Nothing restarts "from scratch": already-`sent` rows are never touched, and future ones keep their original `scheduled_at`.

### 3.3 Idempotency (no double sends)
Four layers:
1. **Enqueue**: deterministic `jobId` means the same row can't be queued twice.
2. **Atomic claim**: `UPDATE email_jobs SET status='sending' WHERE id=$1 AND status='scheduled'`. Only one worker gets a row back; others skip silently.
3. **Terminal state check**: the worker returns immediately unless status is `scheduled`.
4. **Deterministic `Message-ID`** (`<rowId@reachinbox.local>`), so a downstream provider can dedupe.

### 3.4 Concurrency and minimum delay
- `Worker({ concurrency: WORKER_CONCURRENCY })`. Parallel jobs are safe because of the atomic claim and Lua counters.
- `limiter: { max: 1, duration: MIN_DELAY_MS }` is BullMQ's Redis-backed **queue-wide** rate limiter, so the minimum gap holds across every worker and instance, not per process.

### 3.5 Hourly rate limit
- Key: `rl:<senderId>:<YYYY-MM-DDTHH>` (UTC hour window), 2h TTL.
- A small **Lua script** atomically increments and checks the cap (`INCR`, then `DECR` and reject if over). Atomic, so concurrent workers can't overshoot.
- Effective cap per sender = `min(hourlyLimit from the compose form, MAX_EMAILS_PER_HOUR_PER_SENDER)`.
- **When the cap is hit the job is never dropped or failed.** The worker calls `job.moveToDelayed(startOfNextHour + seq % 1000 ms)` and throws `DelayedError`. The DB `scheduled_at` is updated so the UI shows the new time. The tiny `seq`-based offset keeps overflow jobs in roughly their original order (BullMQ breaks timestamp ties FIFO).
- A failed send releases its counter slot, so errors don't burn quota.

### 3.6 Behavior under load (1000+ emails at once)
- Jobs are bulk-inserted in one transaction and bulk-enqueued, so scheduling 1000+ is a couple of round trips.
- The queue-wide limiter drains them at 1 per `MIN_DELAY_MS` however many are due.
- Each sender's counter caps it at its hourly limit; surplus jobs are pushed to the next hour window(s), one window per `limit` emails, with no loss.
- Simulate it: `cd backend && npm run load -- 1000` schedules 1000 emails for the first user starting in 10s with a 50/hour cap, so you can watch the Bull Board and the Slack alert.

### 3.7 Slack notifications
Real OAuth (`/auth/slack/connect` > Slack > `/auth/slack/callback`). The backend stores the incoming-webhook URL per user. When a sender first hits its limit in an hour, the worker posts to that user's webhook. A Redis `SET NX` key per sender+hour ensures **one alert per sender per hour**. If the user hasn't connected Slack, the hit is simply skipped (no crash); once they connect, alerts start working with no redeploy, because the connection is looked up at hit time. `DELETE /api/slack` disconnects.

### 3.8 Search
Every email is indexed in Elasticsearch (`emails` index) when scheduled and re-indexed on send, failure, or reschedule. `GET /api/emails?view=scheduled|sent&q=term` searches recipient, subject and body (fuzzy). If Elasticsearch is down or disabled, the same endpoint falls back to a Postgres `ILIKE` search.

---

## 4. API

All `/api/*` routes need the session cookie.

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/google`, `/auth/google/callback` | Google login |
| POST | `/auth/register`, `/auth/login` | Email + password login (scrypt-hashed) |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Clear session |
| GET | `/auth/slack/connect`, `/auth/slack/callback` | Slack OAuth |
| POST | `/api/schedule` | `{subject, body(html or text), leads[], startTime, delaySeconds, hourlyLimit, senderId?, attachments[]}` |
| GET | `/api/emails?view=&status=&q=&page=&pageSize=` | Scheduled / sent lists, filterable, searchable |
| GET | `/api/emails/:id`, `/api/attachments/:id` | Email detail, attachment download |
| GET | `/api/senders` | Sender accounts for the "From" picker |
| GET | `/api/stats` | Tab counts |
| GET | `/api/slack`, DELETE `/api/slack` | Slack status / disconnect |
| GET | `/admin/queues` | Bull Board |

---

## 5. Features implemented

**Backend**
- [x] Scheduling API stored in Postgres, BullMQ delayed jobs (no cron)
- [x] Multiple Ethereal senders, round-robin
- [x] Restart persistence (Redis AOF + DB reconcile)
- [x] Idempotency (jobId, atomic claim, Message-ID)
- [x] Configurable worker concurrency
- [x] Min delay between sends (queue-wide limiter)
- [x] Per-sender hourly limit (Redis Lua, multi-instance safe), overflow rolled to the next window
- [x] Slack OAuth + live alert on limit hit, connect/disconnect handled
- [x] Elasticsearch indexing and search
- [x] Bull Board at `/admin/queues`
- [x] Retries with exponential backoff, `failed` status

**Frontend** (follows the supplied Figma screens)
- [x] Login screen: Login with Google (real OAuth) plus email/password sign-up and login
- [x] Sidebar shell: pixel logo, user card with Slack connect/disconnect and Logout, Compose button, Scheduled / Sent with live counts
- [x] Inbox lists: search pill, status filter, refresh, orange scheduled-time pills, Sent/Failed pills, star favourites, pagination, 5s live polling
- [x] Email detail page: sender header, sanitized HTML body, attachment cards, Ethereal preview link
- [x] Full-page Compose: From picker (rotate all senders or pick one), recipient chips with "+N", Upload List (CSV/text), subject, delay, hourly limit, rich-text editor, attachments, Send Later popover (date/time + Tomorrow presets), Send / Send Later button
- [x] Loading, empty and error states, toasts, reusable UI components, typed API layer

---

## 6. Assumptions, shortcuts and trade-offs

- **Figma:** the UI was built from the supplied screenshots (login, inbox, detail, compose, send-later). Colours and fonts are approximations; tweak the tokens in `frontend/tailwind.config.js`. The pixel-style logo uses the Silkscreen Google font as a stand-in for the real logo asset.
- **Compose defaults:** an empty *Delay* means 0 seconds and an empty *Hourly Limit* means "no extra limit" (the server still enforces `MAX_EMAILS_PER_HOUR_PER_SENDER`). *Send* starts immediately; *Send Later* uses the chosen time.
- **Rich text:** the editor uses `contentEditable`/`execCommand` (deprecated but universally supported) for a small footprint. Bodies are sanitized server-side (`sanitize-html`) and again on display (DOMPurify).
- **Attachments** (max 5 files / 5 MB total) are stored once per campaign in Postgres (`bytea`) and attached to every email, which is fine at this scale; use object storage for large files.
- **Stars** are stored per browser (localStorage), not in the database.
- **Email/password auth** is minimal (scrypt hashes, no email verification or password reset). Google OAuth is the primary login.
- **Send-then-crash window:** if a worker dies after SMTP accepts but before the DB update, the row stays `sending` and the stale-reset can resend it after 5 minutes. True exactly-once is impossible with SMTP; the deterministic Message-ID mitigates it.
- **Order under overflow** is best-effort FIFO (same-timestamp tie-break), not strict.
- **Limiter is global per queue,** not per sender; per-sender throughput is governed by the hourly cap.
- **Delay and multiple senders:** `scheduled_at` spacing is per campaign, so with N senders each sender is hit every `N * delay`.
- **Hour windows are UTC clock hours,** not rolling 60 minutes (cheap, atomic, predictable).
- **Ethereal credentials** are stored in plaintext in Postgres. They're throwaway test accounts; use a secret manager for real SMTP.
- **Elasticsearch is eventually consistent** and best-effort; Postgres stays authoritative.
- **Reconcile runs at boot only.** A periodic reconcile would also heal a Redis flush while running.
- Single-tenant-per-user: senders are shared across users; only emails and Slack are per user.
- No automated test suite is included; the load script and Bull Board are the verification tools.

---

## 7. Demo checklist (5 min)

1. Log in with Google, connect Slack.
2. Compose: upload a list, pick *Send Later* a couple of minutes ahead, delay 5s, hourly limit 3 (small, to trigger Slack), then Send Later.
3. Show Scheduled tab, Bull Board delayed jobs, Elasticsearch search.
4. **Restart:** stop the backend (Ctrl+C) before the start time, start it again, show the jobs still fire at the right time with no duplicates.
5. Show Sent tab with Ethereal preview links, and the Slack message when the limit hits and overflow jobs show a next-hour time.
6. Optional: `npm run load -- 1000` and watch throttling.
