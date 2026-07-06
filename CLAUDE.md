# CLAUDE.md

Guidance for Claude and Claude-style coding agents working on this repository.

Before implementing code, read:

- `README.md` — project overview, quickstart, and environment contract
- `DESIGN.md` — design system (required before any UI change)
- `AGENTS.md` — general agent policy

`AGENTS.md` is the general agent policy. This file adds Claude-specific working guidance and summarizes the highest-risk project constraints.

## Working Style

Be direct, conservative, and safety-oriented. This is trading automation software, so convenience must not outrank correctness, auditability, and explicit user control.

Default behavior:

- Ground work in the docs and existing code.
- Implement the smallest coherent issue slice.
- Keep architecture modular.
- Write tests with every meaningful change.
- Do not introduce unreviewed product scope.
- Do not hide uncertainty in trading, risk, source, or execution behavior.

If a requested change conflicts with `README.md`, `DESIGN.md`, or `AGENTS.md`, call it out before implementation.

## Project Mission

Pasa Trader Platform is a self-hosted operating system for automated trading. It turns strategy templates into repeatable automations using evidence collection, AI synthesis, proposed orders, deterministic risk validation, broker execution, logging, dashboards, and safety controls.

It is not:

- A financial-advice product.
- A guaranteed-return product.
- A custody product.
- A public strategy marketplace.
- A generic unconstrained web-browsing agent.

## Critical Architecture Decisions

Preserve these unless the user explicitly changes the ERD:

- TypeScript-first modular monolith.
- `pnpm` workspace.
- Next.js App Router.
- REST + OpenAPI.
- Zod runtime schemas.
- PostgreSQL + Prisma.
- Graphile Worker.
- Tailwind + shadcn/ui.
- Custom model adapters for OpenAI/Anthropic-compatible providers.
- Typed code-first agent workflows.
- Strict allowlisted source connectors.
- Fetch first, Playwright fallback only inside approved connectors.
- Docker Compose with Caddy.
- First-user local admin auth.

Do not introduce:

- LangChain/LangGraph as the main orchestration layer.
- Microservices for MVP.
- Plugin marketplace/runtime extension system for MVP.
- tRPC/GraphQL as the main API boundary.
- Redis/Temporal as required MVP infrastructure.
- Arbitrary user-defined scraping.

## Implementation Order

The platform was built in dependency-ordered phases. When extending it, respect the same layering:

1. Phase 0: foundation.
2. Phase 1: auth/security/audit.
3. Phase 2: core domain/strategy templates.
4. Phase 3: adapters/source collection.
5. Phase 4: agents/proposed orders.
6. Phase 5: risk engine.
7. Phase 6: paper execution.
8. Phase 7: scheduling.
9. Phase 8: UI/visibility.
10. Phase 9: live trading/hardening.

Do not implement later-phase features if an earlier dependency is missing. Add the missing dependency or split the work.

These phases describe the historical build order and the module dependency graph; they are not an active backlog.

## Safety-Critical Rules

Hard rules:

- AI does not execute trades.
- AI does not place stops.
- AI does not validate risk.
- AI does not fetch arbitrary web data.
- UI does not call broker/model/source providers directly.
- Hard risk blocks cannot be overridden.
- Live trading cannot be enabled silently.
- Live execution requires acknowledgment.
- Broker outage blocks execution.
- Missing required evidence blocks executable proposed orders.
- Stop placement failure must mark the position unprotected and notify the user.
- Plaintext credentials must never be persisted.

If a change touches any of these paths, add tests.

## Agentic AI Guidance

Use typed code-first workflows. Treat agents as deterministic orchestrations with model calls inside clearly bounded steps.

Agent workflow requirements:

- Explicit input schema.
- Explicit output schema.
- Tool allowlist.
- Model provider adapter.
- Structured logging metadata.
- Schema validation after model response.
- No raw model output entering execution.

Agents may summarize, rank, rationalize, draft proposed orders, explain uncertainty, and reflect. They may not own external data access, calculations, risk decisions, or execution.

## Web and Scraping Guidance

MVP source access is connector-driven.

Use this preference order:

1. Official API.
2. Static fetch/parse of allowlisted public page.
3. Playwright rendering inside an approved connector only.

Never add:

- Free browsing.
- User-supplied arbitrary URLs.
- CAPTCHA bypass.
- Anti-bot evasion.
- Login bypass.
- Private authenticated scraping.

Every connector needs source status and reliability metadata.

## Testing Requirements

Claude should bias toward tests before declaring work complete.

Required coverage patterns:

- Domain schemas: unit tests.
- Prisma migrations: integration tests against PostgreSQL.
- Graphile Worker jobs: integration tests.
- Adapters: contract tests with fixtures/mocks.
- Alpaca execution: mocked tests for paper/live, broker outage, stop failure, duplicate stop prevention.
- Agent workflows: fixture model responses, invalid output tests, schema validation tests.
- Risk engine: pass/warning/hard-block cases.
- UI flows: Playwright for onboarding, strategy fork, proposed-order review, paper execution, dashboard, live acknowledgment.

If a test cannot be run locally, state why and document residual risk.

Test commands and current coverage:

| Suite | Command | Covers |
| --- | --- | --- |
| Unit | `pnpm test` | Domain services, schemas, adapters, agent workflows, risk engine, API route gates (mocked DB/broker). |
| Integration | `pnpm test:integration` | Full paper execution loop against a real PostgreSQL (`<db>_test`, auto-created/migrated): risk pass → fill → stop placement, buying-power hard block, stop failure handling, broker outage block, live-acknowledgment gate. Broker HTTP is faked at the `fetch` boundary; everything below is real. Requires the compose postgres (`docker compose up -d postgres`). |
| E2E | `pnpm test:e2e` | Playwright against a dev web server (`tests/e2e/`): health, OpenAPI contract, auth, strategy lifecycle/tabs, live acknowledgment flow, Live Access PIN guard, notifications/proposals rendering. |

CI (`.github/workflows/ci.yml`) runs typecheck + all three suites with a PostgreSQL service container.

## Code Quality Expectations

Use clear module boundaries and boring code.

Prefer:

- Small domain services.
- Explicit schemas.
- Explicit state transitions.
- Descriptive error codes.
- Structured logs.
- Append-only audit records.
- Dependency injection for adapters.
- Fixture-based external integration tests.

Avoid:

- Hidden side effects.
- Provider-specific logic leaking into core domain services.
- Global mutable state for strategy runs.
- Retrying trading actions without idempotency or duplicate checks.
- Broad catch blocks that swallow execution failures.
- UI-only safety checks.

## Documentation Expectations

Update docs in the same change when adding or changing:

- Environment variables.
- Docker services.
- Setup commands.
- Credential handling.
- Source connector behavior.
- Agent permissions.
- Risk rules.
- Execution behavior.
- Live trading warnings.

Documentation is part of done for this project.

## GitHub Issue Discipline

The repository has GitHub issues generated from `implementation-plan.md`.

When working an issue:

- Use the issue ID in branch/commit/PR names where practical.
- Respect dependency IDs.
- Keep PRs phase-aligned.
- Include acceptance criteria in PR description.
- Do not close the issue unless tests and acceptance criteria are satisfied.

Recommended branch format:

```text
codex/p0-s1-workspace-foundation
codex/p1-s4-encrypted-credentials
codex/p6-s2-alpaca-paper-execution
```

## Default Response Expectations

When reporting work:

- State what changed.
- State tests run.
- State any unresolved risk.
- Link relevant files.
- Reference GitHub issue numbers when applicable.

Do not over-explain routine implementation details.

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, radii, and aesthetic direction are defined there.

Hard rules:

- Green / amber(gold) / red are reserved for P&L and risk semantics — never for branding.
- Copper is brand / action / focus only, never a status color.
- Flat, opaque, hairline-bordered surfaces on data screens — no glassmorphism, no emoji.
- The ambient gradient is allowed only on sign-in, setup/onboarding, and empty states.
- All numbers, tickers, prices, IDs, and timestamps render in Geist Mono (tabular-nums).

Do not deviate without explicit user approval. In QA, flag any code that diverges.
