# Smart Todo workspace

A private, saved workspace for projects and tasks at https://smart-todolist.giorgi.app.

- Register/sign in with email and password. Verify your email before using AI. Sessions use HttpOnly cookies; passwords use salted scrypt hashes.
- Create projects, move tasks, set priorities/due dates/estimates, and track subtasks.
- Save tasks immediately. Request AI descriptions, estimates or breakdowns separately, with progress and retry.
- Preview a project plan before accepting its tasks, sort tasks, fill missing details, and export a project as JSON.

## Develop

Use Node **24.22.1** and pnpm **11.25.0**:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Manual features work without a key. For OpenAI, set server-only `AI_API_KEY` and optionally `AI_MODEL` (default `gpt-4.1-mini`). Never prefix these variables with `NEXT_PUBLIC_`, commit `.env` files, or put keys in chat. `AI_BASE_URL` defaults to `https://api.openai.com/v1` and can point to a compatible local test provider.

`APP_URL` is the exact browser origin for request-origin validation and secure cookies. It defaults to `http://localhost:3000` in development; set it explicitly in production. `DATABASE_PATH` defaults to `.data/workspace.sqlite`. Production stores it outside releases at `/var/lib/smart-todolist/workspace.sqlite`.

## Verify

```sh
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

`tests/core.test.ts` covers ownership, passwords, persistence, concurrent edits, provider failures/timeouts, and planning. For HTTP/browser checks, start `node tests/mock-provider.mjs`, then the built app with:

```sh
APP_URL=http://127.0.0.1:3100 DATABASE_PATH=/tmp/smart-test.sqlite AI_API_KEY=test-only AI_BASE_URL=http://127.0.0.1:4110 pnpm start --hostname 127.0.0.1 --port 3100
node tests/integration.mjs
node tests/browser.mjs
```

Browser tests use `/usr/bin/chromium` or `CHROMIUM_PATH`. The mock provider is only a test fixture.

## Production deployment

The droplet has 1 GB RAM, so build elsewhere. Package `.next/standalone`, `.next/static` and `public`, plus `deploy/install-workspace.sh`. Only deploy a tested artifact pinned to an immutable Git commit and SHA256 checksum.

The deployment workflow is `.github/workflows/smart-workspace-deploy.yml` in `giorgi0203/portfolio`, where the working droplet SSH secrets live. `SMART_TODO_AI_KEY` holds the OpenAI key. The installer accepts it through the environment, writes `/etc/smart-todolist/ai.json` with root:www-data permissions, then unsets it. No key goes into public artifacts. A private Node 24 runtime leaves other applications' Node installation unchanged.

The installer backs up SQLite, legacy shared data and previous configuration, updates a systemd override, and restores the previous web service if health checks fail. Old .NET agent files/data stay preserved. The new app never exposes its shared task list, and does not assign legacy tasks to a new user because their ownership is unknown.

SQLite uses WAL, transactions, owner-scoped queries and task versions to reject stale AI/edit results. Only the service account should access its database directory. Use SQLite's backup API for a live WAL database and keep off-droplet backup copies separately.

AI calls require a verified email and have a 25-second limit, 10 requests/minute and 30 requests/24 hours per account, plus a shared 200 requests/24 hours across the entire app. Quotas are persistent and reserved atomically, so extra accounts cannot evade the shared cap. These are request caps, not an exact dollar budget. OpenAI API billing is separate from ChatGPT; configure a project budget and usage alerts in OpenAI. Password recovery and social sign-in are not implemented.

`agent/`, older `scripts/`, and `deploy/setup-server.sh` are historical. Do not run the legacy installer against the new workspace.

## Verification email

Resend sends from `Smart Todo <noreply@mail.giorgi.app>`. Production reads server-only `/etc/smart-todolist/email.json` through `EMAIL_CONFIG_FILE`. For development, use `EMAIL_API_KEY`, optionally `EMAIL_FROM` and `EMAIL_BASE_URL`. Never expose these to the browser. The reusable setup workflow in the portfolio repository provisions the sending domain with `SMART_TODO_EMAIL_KEY`; DigitalOcean DNS needs its DKIM/SPF/MX records. `api/health` reports whether a key is configured, not delivery success.

Existing and new accounts start unverified. Manual projects/tasks work immediately, and every AI path checks verification on the server. Verification emails contain a one-use 256-bit token in a URL fragment. SQLite stores its SHA256 hash, with a one-hour expiry. GET requests never consume the token: the recipient must press Verify email. Sending a new link invalidates the previous link. Email confirmation does not log anyone in or change a different browser account.

Sending is limited to one attempt/minute, 5/hour and 10/day per account, 10/hour per IP, and 100/day shared. Registration is limited to 5/hour per IP and 50/day shared, with a hidden bot-trap field. These limits also apply when email delivery fails; registration still creates a usable manual workspace and explains the delivery failure. No existing accounts are automatically trusted during migration.

For full local integration/browser tests, also run `node tests/mock-email.mjs` and configure `EMAIL_API_KEY=test-only EMAIL_BASE_URL=http://127.0.0.1:4111` on the app server. This test mail service binds only to loopback and is never included in a production release. `deploy/verify-workspace.py` seeds and removes its own temporary fixtures, exercises the production verification gate and token redemption, and never sends email to fake recipients.

## Portfolio analytics and enquiries

The portfolio at `giorgi.app` uses this server's `/api/contact` and `/api/analytics/event` endpoints through its existing Nginx proxy. `/etc/smart-todolist/contact.json` configures the enquiry recipient as `{ "email": "owner@example.com" }` (root:www-data 0640), or set server-only `CONTACT_EMAIL`. Visitors' email addresses are used as Reply-To; delivery uses the verified sending domain and does not consume AI credits.

The private report is `/portfolio-analytics` on the Smart Todo domain. Sign in with a verified account whose email matches the contact recipient. Other users and unverified accounts cannot read analytics. Page views, external referrer hostnames and whitelisted outbound-link clicks are aggregated by UTC day in SQLite. No tracking cookies, full visitor IPs, URLs/query strings, or contact-message text are stored in analytics. Daily IP hashes are used only for short-lived anti-spam rate limits. The browser and collector honor DNT/GPC. Aggregates older than 90 days are pruned as new events arrive; event counts are approximate and do not represent unique visitors. This is for the portfolio homepage; the subdomain applications are counted as outgoing clicks, not instrumented internally.
