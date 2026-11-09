# Smart Todo workspace

A private, saved workspace for projects and tasks at https://smart-todolist.giorgi.app.

- Register/sign in with email and password. Sessions use HttpOnly cookies; passwords use salted scrypt hashes.
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

AI calls have a 25-second limit and per-user concurrency/daily/minute limits. OpenAI API billing is separate from ChatGPT; configure a project budget and usage alerts in OpenAI. Email verification, password recovery and social sign-in are not implemented.

`agent/`, older `scripts/`, and `deploy/setup-server.sh` are historical. Do not run the legacy installer against the new workspace.
