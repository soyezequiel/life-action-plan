# Pulso — Life Action Plan

**Pulso** (formerly LAP) is a personal planning web app that uses LLM assistance to help users create, simulate, and execute structured life action plans.

Built with Next.js 15, React 19, TypeScript, PostgreSQL, and Drizzle ORM.

## Features

- **Guided intake** — conversational onboarding that captures goals, constraints, and priorities
- **AI-powered plan generation** — LLM builds a phased action plan with milestones and dependencies
- **Reality check** — compares required hours vs. available time; surfaces trade-offs
- **Plan simulation** — iterative week-by-week simulation to catch scheduling conflicts before they happen
- **Daily execution dashboard** — tasks, progress tracking, streaks, and on-demand re-planning
- **Calendar export** — `.ics` export for integration with external calendars
- **Lightning payments** — optional pay-per-build via Nostr Wallet Connect (NWC)
- **Multi-provider LLM** — supports OpenAI, OpenRouter, or local Ollama for development
- **LLM Inspector** — built-in debug panel with trace, token stream, and snapshot views

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19, CSS Modules, Framer Motion |
| Language | TypeScript (strict) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (`.strict()` on all new schemas) |
| Auth | Session tokens (JWT via `jose`), Argon2 password hashing |
| AI | Vercel AI SDK + `@ai-sdk/openai` |
| Payments | `@getalby/sdk` (Lightning / NWC) |
| Dates | Luxon |
| Testing | Vitest + Testing Library |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (local or cloud)
- *(Optional)* Ollama for local LLM development

### Setup

```bash
# Install dependencies
npm install

# Create local environment file
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lap
SESSION_SECRET=<random-string>
OPENAI_API_KEY=<your-key>          # or configure via Settings UI
OLLAMA_BASE_URL=http://localhost:11434  # optional, for local dev
```

### Database

```bash
# Push schema to your database
npm run db:push
```

### Run

```bash
npm run dev
```

The app starts at `http://localhost:3000`.

### Verify Environment

```bash
# Local: checks DB connection + Ollama availability
npm run smoke:local

# Pre-deploy: runs build + deploy readiness checks
npm run smoke:deploy
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run typecheck` | Type-check without emitting |
| `npm run test` | Run test suite |
| `npm run lint` | Lint with ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run pending migrations |
| `npm run doctor:local` | Check local environment health |
| `npm run doctor:deploy` | Check deploy readiness |
| `npm run smoke:local` | DB push + local doctor |
| `npm run smoke:deploy` | Build + deploy doctor |

## Project Structure

```
app/                    # Next.js App Router
  api/                  # Route Handlers (REST API)
    auth/               # Register, login, logout, session
    plan/               # Build, simulate, list, export
    settings/           # Credentials, API keys, build preview
    wallet/             # NWC connect, disconnect, status
    intake/             # Profile intake
    debug/              # LLM inspector endpoints
  intake/               # Intake page
  settings/             # Settings page

components/             # React components
  settings/             # Settings panel sections
  debug/                # LLM inspector UI

src/lib/                # Server and client libraries
  auth/                 # Authentication (sessions, passwords)
  client/               # Client-side utilities and vault
  db/                   # Drizzle schema and helpers
  payments/             # NWC provider, wallet, charging
  providers/            # LLM provider abstraction
  runtime/              # Execution context resolver
  skills/               # Plan-building skills

src/i18n/               # Internationalization (es-AR)
tests/                  # Unit and integration tests
```

## Environments

| Environment | Database | LLM Provider | Purpose |
|-------------|----------|-------------|---------|
| Local dev | PostgreSQL local | Ollama or OpenAI | Daily development |
| Vercel preview | PostgreSQL cloud | Cloud provider | Pre-merge validation |
| Vercel prod | PostgreSQL cloud | Cloud provider | Production |

> Ollama is only available in local development. Vercel deployments require a cloud LLM provider.

## User Flow

1. **Register / Login** — create an account or authenticate
2. **Configure** — set up LLM provider and optionally connect a Lightning wallet
3. **Intake** — answer guided questions about goals and constraints
4. **Build** — AI generates a phased plan with reality checks
5. **Simulate** — iterative simulation validates the plan
6. **Execute** — daily dashboard with tasks, progress, and streaks

## Contributing

This project uses internal development documents for architecture decisions:

- `AGENTS.md` — agent context and project state
- `PLAN_LAP_FINAL.md` — architectural source of truth

## License

Private — all rights reserved.
