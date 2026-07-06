# GEMINI.md - Project Context for Pasa Trader Platform

## Project Purpose
Pasa Trader Platform is a self-hosted operating system for automated trading. It turns strategy templates into repeatable automations using evidence collection, AI synthesis, proposed orders, deterministic risk validation, broker execution, logging, dashboards, and safety controls.

It is **not** a financial-advice, guaranteed-return, custody, or public strategy marketplace product.

## Specific Architecture
The platform is a TypeScript-first modular monolith distributed via Docker Compose with a Caddy reverse proxy:
- **Frontend/Web App:** Next.js App Router API & web pages (`apps/web`).
- **Worker/Scheduler:** Graphile Worker process (`apps/worker`) running jobs and scheduling.
- **Database:** PostgreSQL + Prisma (`packages/db`).
- **Domain Logic:** Core services (`packages/core`).
- **Contracts/Adapters:** Integrations for broker/model/source endpoints (`packages/adapters`).
- **AI Synthesis:** Structured model adapters and typed agent workflows (`packages/agents`).
- **Run-time Validation:** Single source-of-truth Zod schemas (`packages/schemas`).

## Map of Key Files and Directories
- [prd.md](file:///Users/openrijal/projects/pasa-trader-platform/prd.md): Product requirements, user workflows, MVP scope, safety posture.
- [erd.md](file:///Users/openrijal/projects/pasa-trader-platform/erd.md): Engineering architecture, platform choices, module boundaries, database schema.
- [implementation-plan.md](file:///Users/openrijal/projects/pasa-trader-platform/implementation-plan.md): Phased roadmap, stories, and phase gates.
- [AGENTS.md](file:///Users/openrijal/projects/pasa-trader-platform/AGENTS.md): Core platform principles, module boundaries, and trading safety rules.
- [CLAUDE.md](file:///Users/openrijal/projects/pasa-trader-platform/CLAUDE.md): Claude-style working guidance and response expectations.
- [apps/web/](file:///Users/openrijal/projects/pasa-trader-platform/apps/web): Next.js web application and API endpoints.
- [apps/worker/](file:///Users/openrijal/projects/pasa-trader-platform/apps/worker): Background worker process.
- [packages/core/](file:///Users/openrijal/projects/pasa-trader-platform/packages/core): Core business logic (auth, audit logs, strategy configurations, accounts).
- [packages/db/](file:///Users/openrijal/projects/pasa-trader-platform/packages/db): Prisma schema and client.
- [packages/schemas/](file:///Users/openrijal/projects/pasa-trader-platform/packages/schemas): Zod schema definitions and OpenAPI schemas.
- [packages/adapters/](file:///Users/openrijal/projects/pasa-trader-platform/packages/adapters): External API connectors (Alpaca, OpenAI/Anthropic, scraping sources).
- [packages/agents/](file:///Users/openrijal/projects/pasa-trader-platform/packages/agents): Bounded model calls and agent reasoning logic.

## Local Setup and Running
To set up the project locally:
1. **Install Dependencies:**
   ```bash
   pnpm install
   ```
2. **Build Packages & Web:**
   ```bash
   pnpm build
   ```
3. **Run Tests:**
   ```bash
   pnpm test
   ```
4. **Environment Variables:**
   Configure a `.env` file based on `.env.example` in the project root.

## Project Conventions
- **Verify, then Trust:** Always verify the environment, database connection, and existing code behavior before writing code.
- **Safety First:** AI cannot directly execute trades, place stops, or override risk rules. Hard risk blocks are non-bypassable.
- **Deterministic Risk Rules:** Proposed orders must pass the deterministic risk engine before execution.
- **Encrypted Credentials:** All external credentials must be encrypted using AES-256-GCM.
- **Testing:** All features must be fully covered by unit, integration, or E2E tests.
