# AGENTS.md

Guidance for coding agents working on Pasa Trader Platform.

## Project Source of Truth

Read these documents before implementing non-trivial changes:

- `prd.md`: product requirements, user workflows, MVP scope, safety posture.
- `erd.md`: engineering architecture, platform choices, module boundaries, agent/web-access rules.
- `implementation-plan.md`: phased roadmap, GitHub issue structure, story dependencies, acceptance criteria.

If these documents conflict, resolve in this order:

1. User's latest explicit instruction.
2. Safety and compliance constraints in `prd.md` and `erd.md`.
3. `implementation-plan.md`.
4. Existing code behavior and tests.

Do not silently reinterpret product scope. If an implementation requires changing PRD/ERD decisions, update the relevant document or ask for confirmation.

## Product Principles

Pasa Trader Platform is a self-hosted operating system for automated trading. It is not a generic trading bot, public marketplace, hosted SaaS, or financial-advice product.

Core principles:

- User-controlled: users own broker credentials, model keys, strategy settings, risk settings, and execution mode.
- Paper-first, live-capable: paper trading is the default first path; live trading must be explicit and visibly labeled.
- Deterministic safety boundary: AI may propose and explain, but deterministic services must fetch data, calculate, validate, and execute.
- No silent execution: failed validation, broker outage, missing required evidence, or hard risk block must stop execution.
- No custody: never imply the platform holds funds.
- No guaranteed returns: never introduce copy/UI language implying profit guarantees or personalized financial advice.
- Defaults-first: first-run UX should work with sensible defaults while preserving advanced controls.

## Architecture Baseline

Follow the ERD unless explicitly changed:

- TypeScript-first modular monolith.
- `pnpm` workspace.
- Next.js App Router web/API process.
- REST + OpenAPI API boundary.
- Zod as runtime schema source of truth.
- PostgreSQL + Prisma.
- Graphile Worker for jobs and scheduling.
- Custom model-provider adapters wrapping OpenAI/Anthropic-compatible SDKs.
- Typed code-first agent workflows.
- API-first source access with strict allowlisted scraping.
- Fetch first, Playwright fallback only inside approved connectors.
- Docker Compose distribution with Caddy reverse proxy.
- First-user local admin auth.

Preferred workspace shape:

```text
apps/
  web/
  worker/
packages/
  core/
  db/
  schemas/
  adapters/
  agents/
  ui/
```

## Module Boundary Rules

Required dependency direction:

- UI calls application APIs, not external providers.
- API orchestrates domain modules.
- Workers run jobs through domain services.
- Agents call only typed tools.
- Broker execution occurs only through execution service after risk validation.
- Source connectors normalize evidence; they do not create proposed orders.
- Model adapters produce structured outputs; they do not bypass schemas.
- Risk engine owns pass/warning/hard-block decisions.

Forbidden patterns:

- Direct broker/model/source calls from UI.
- Broker order submission from an agent.
- Raw model output entering execution flow.
- Risk validation only in frontend code.
- Arbitrary user-defined scraping.
- Free-browsing agents.
- Hidden retry/catch-up execution after downtime.
- Plaintext credential persistence.

## Agentic AI Rules

Agents may:

- Summarize evidence.
- Rank trade ideas.
- Generate rationales.
- Draft proposed orders.
- Explain uncertainty.
- Reflect on completed strategy runs.

Agents may not:

- Browse arbitrary websites.
- Add new source domains at runtime.
- Call raw external APIs.
- Calculate portfolio/risk values without deterministic tool output.
- Submit broker orders.
- Place stops.
- Modify credentials.
- Change execution mode.
- Override hard risk blocks.

All model outputs used by the product must be schema-validated before persistence or downstream use.

Default model logging stores structured output and metadata only. Full prompt/response logging is opt-in.

## Web Access and Scraping Rules

MVP web access is strict allowlist only.

Allowed:

- Official APIs.
- Platform-reviewed public endpoints.
- Platform-reviewed public pages for controlled scraping.
- User-provided API keys for supported providers.
- Fetch-based parsing of allowlisted pages.
- Playwright rendering only when a connector requires it.

Not allowed:

- Arbitrary user URLs.
- Login bypass.
- CAPTCHA bypass.
- Anti-bot evasion.
- Credential stuffing.
- Uncontrolled browser agents.
- Scraping private authenticated accounts unless explicitly designed later.

Every source connector must declare reliability:

- `official_api`
- `official_scrape`
- `third_party_api`
- `best_effort_scrape`

Missing, stale, delayed, partial, or failed evidence must be surfaced.

## Trading Safety Rules

Execution must follow this order:

1. Load strategy instance.
2. Load broker account and environment.
3. Load proposed orders.
4. Validate proposed-order schema.
5. Validate evidence requirements.
6. Validate risk.
7. Validate broker/account capabilities.
8. Confirm execution mode.
9. Confirm live acknowledgment when live.
10. Submit order through execution service.
11. Place trailing stop when configured.
12. Persist result.
13. Emit audit event.
14. Emit notification when needed.

Never skip validation for live execution.

Hard risk blocks cannot be overridden. The user must change settings/order inputs and rerun validation.

Broker API downtime blocks execution. Do not queue blind later execution.

If stop placement fails after an entry fill:

- Notify user.
- Mark position unprotected.
- Retry only when safe.
- Check for duplicate stops before retry.

## Security Rules

Authentication:

- First-user admin on first boot.
- Local email/password.
- Argon2id password hashing.
- HttpOnly cookies.
- CSRF protection for state-changing browser requests.

Credentials:

- Encrypt broker/model/source credentials at rest.
- Use deployment-level encryption key.
- Use authenticated encryption, default AES-256-GCM.
- Use per-record IV/auth tag.
- Never display plaintext credentials after save.
- Audit credential create/update/delete/test.

Live trading:

- Must be explicitly acknowledged.
- Must preserve acknowledgment version, timestamp, user, strategy/account references where applicable.
- Must be visually distinct from paper trading.

## Testing Expectations

Use the test strategy from `implementation-plan.md`.

Minimum expectations by change type:

- Schema/domain changes: unit tests and integration tests.
- Prisma changes: migration test against PostgreSQL.
- Adapter changes: contract tests with fixtures/mocks.
- Agent changes: fixed model fixtures, schema validation tests, invalid-output tests.
- Risk changes: explicit pass/warning/hard-block tests.
- Execution changes: mocked Alpaca tests for paper/live labels, broker outage, stop failure, duplicate stop prevention.
- UI workflow changes: Playwright E2E where user-critical.
- Security changes: auth/session/CSRF/encryption tests.

Do not treat untested trading or credential logic as complete.

## GitHub Workflow

Use the GitHub issues created from `implementation-plan.md`.

Expected workflow:

1. Pick an issue from the earliest unblocked phase.
2. Read the parent epic and dependent issues.
3. Implement only the issue scope unless the dependency is truly missing.
4. Add or update tests matching the issue acceptance criteria.
5. Update docs if behavior or setup changes.
6. Reference the issue in commits/PRs.

Issue labels use:

- `type: epic`
- `type: story`
- `area: ...`
- `priority: ...`
- `phase: ...`

Do not close a story unless every acceptance criterion is met.

## Documentation Rules

Update docs when:

- Setup commands change.
- Environment variables change.
- Security behavior changes.
- Risk/execution behavior changes.
- Source connector behavior changes.
- Agent permissions or tool boundaries change.

Keep PRD/ERD/implementation-plan aligned. If a change alters product or architecture decisions, update the relevant document in the same PR.

## Non-Goals

Do not implement these in MVP unless explicitly re-scoped:

- Hosted multi-tenant platform.
- Public signup.
- Billing.
- Public strategy marketplace.
- Strategy builder from scratch.
- Strategy ingestion from YouTube, Reddit, blogs, or newsletters.
- Backtesting.
- Broker support beyond Alpaca.
- Crypto, options, futures, forex, non-US equities, or fractional shares.
- Free-browsing agents.
- Arbitrary user-defined scraping.
- Native mobile app.
