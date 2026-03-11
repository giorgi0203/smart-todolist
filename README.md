# Smart TodoList (Next.js + CopilotKit + Microsoft Agent Framework)

Smart TodoList is an AI-assisted task manager with two runtimes:

- A Next.js web app for the UI and CopilotKit chat experience.
- A .NET agent backend that manages todo state and uses an AI model to enrich tasks.

The assistant can help users:

- Add and manage tasks.
- Generate practical task descriptions.
- Estimate task duration in minutes.
- Split tasks into actionable subtasks.
- Sort tasks intelligently by priority/content.

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- AI UI/runtime bridge: CopilotKit
- Agent backend: ASP.NET Core (.NET 10) + Microsoft Agent Framework (AG-UI)
- Model client: OpenAI client against GitHub Models endpoint

## How It Works

1. The web app mounts CopilotKit with agent name my_agent.
2. The Next.js API route at /api/copilotkit forwards chat/runtime traffic to the local agent endpoint at http://localhost:8000/.
3. The .NET agent receives the current todo state, runs tools (get/add/update/delete/toggle/set), persists todos to a JSON file, then returns:
	- Updated state as JSON
	- A short user-facing summary of what changed

## Project Structure

- src/app: Next.js App Router pages and API endpoints
- src/components: Todo UI components
- src/lib/types.ts: Shared frontend state types
- agent: .NET agent backend and tool logic
- scripts: Local helper scripts for setup and agent run
- deploy: Server bootstrap script, nginx config, and systemd unit templates
- .github/workflows/deploy.yml: CI/CD pipeline for build and deploy

## Prerequisites

- Node.js 20+
- pnpm 9+ (recommended, lockfile is pnpm)
- .NET SDK 10.0+
- A GitHub token with access to GitHub Models (used by the agent as GitHubToken)

## Local Development

### 1) Install dependencies

With pnpm (recommended):

```bash
pnpm install
```

With npm:

```bash
npm install
```

Note: postinstall runs scripts/setup-agent.bat on Windows by default. On Linux/macOS, use scripts/setup-agent.sh if needed.

### 2) Configure agent secret

From the repository root:

```bash
cd agent
dotnet user-secrets set GitHubToken "<your-github-token>"
```

This value is required. If missing, the agent exits at startup.

### 3) Run the app

From the repository root:

```bash
pnpm dev
```

This starts both:

- Next.js UI on http://localhost:3000
- .NET agent on http://localhost:8000

Alternative scripts:

- pnpm dev:ui (UI only)
- pnpm dev:agent (agent only)
- pnpm dev:debug (same as dev with debug log level)

## Build and Run (Production Mode)

Build web app:

```bash
pnpm build
```

Run web app:

```bash
pnpm start
```

Publish .NET agent:

```bash
dotnet publish agent/ProverbsAgent.csproj -c Release -o agent-publish
```

## Agent Tools (Backend Capabilities)

The .NET agent exposes these operations to the model:

- get_todos
- add_todo
- update_todo
- delete_todo
- toggle_todo
- toggle_subtask
- set_todos (bulk replace, used for sorting/reordering)

Todos are persisted to a todos.json file in the agent runtime directory.

## Deployment Overview

CI/CD is defined in .github/workflows/deploy.yml.

Build job:

- Installs dependencies with pnpm
- Runs lint and build
- Packages Next.js standalone artifacts
- Publishes .NET agent
- Uploads artifacts

Deploy job (on push to main):

- Downloads build artifacts
- Copies files to your server
- Writes agent appsettings.Production.json with GitHub token secret
- Restarts systemd services for web and agent
- Reloads nginx

## One-Time Server Setup (Ubuntu)

Use deploy/setup-server.sh on a fresh server. It installs Node.js, ASP.NET runtime, nginx, certbot, creates app directories, and installs systemd services.

Example:

```bash
ssh root@your-droplet 'bash -s' < deploy/setup-server.sh
```

Before using it, update the DOMAIN value inside deploy/setup-server.sh.

## Required GitHub Secrets (for deploy workflow)

- DROPLET_HOST
- DROPLET_USERNAME
- DROPLET_SSH_KEY
- DROPLET_SSH_PASSPHRASE (if your key is passphrase-protected)
- AGENT_GITHUB_TOKEN

AGENT_GITHUB_TOKEN is written to appsettings.Production.json on deploy as GitHubToken.

## Troubleshooting

Agent fails at startup with token error:

- Ensure GitHubToken is set via dotnet user-secrets locally, or AGENT_GITHUB_TOKEN in CI.

UI loads but assistant actions do nothing:

- Confirm agent is running at http://localhost:8000.
- Confirm Next.js API route /api/copilotkit is reachable.

Port conflicts:

- UI expects port 3000.
- Agent expects port 8000 (from agent launch profile).

## Useful Commands

```bash
pnpm lint
pnpm build
pnpm dev
pnpm dev:ui
pnpm dev:agent
```

```bash
cd agent
dotnet run --launch-profile http
```

## License

See LICENSE.
