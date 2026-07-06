# Contributing to TraderPasa

Thank you for your interest in contributing. This is trading automation software — correctness and safety are non-negotiable.

## Development Setup

**Requirements:** Docker, Node.js ≥ 22, pnpm ≥ 10

```bash
git clone https://github.com/worldofpasa/traderpasa.git
cd traderpasa
corepack enable
pnpm install

# Start Postgres (required for integration tests and dev)
docker compose up -d postgres

# Start the web app in dev mode
pnpm dev:web

# Start the background worker in dev mode (separate terminal)
pnpm dev:worker
```

The app is available at `http://localhost:3000` (dev) or `http://localhost:8080` (via Caddy/Docker).

## Running Tests

```bash
pnpm test                  # Unit tests
pnpm test:integration      # Integration tests (requires Postgres via Docker)
pnpm test:e2e              # Playwright end-to-end tests
pnpm typecheck             # TypeScript
pnpm lint                  # ESLint (zero warnings policy)
```

All three test suites must pass before a PR is merged.

## Pull Request Guidelines

- Keep PRs focused — one logical change per PR.
- Include tests for any new or changed behavior.
- Update docs (env vars, runbooks) in the same PR if applicable.
- PRs touching auth, credential encryption, or the risk engine require line-by-line review — expect extra scrutiny.

## Safety Invariants

These must never be violated:

- AI does not execute trades, place stops, or validate risk.
- Hard risk blocks cannot be overridden by users.
- Live trading requires explicit acknowledgment — it cannot be enabled silently.
- Plaintext broker credentials must never be persisted.
- UI does not call broker/model/source providers directly.

If your change touches any of these paths, add tests.

## Dependency Policy

Only add dependencies with MIT, Apache-2.0, or ISC licenses. No copyleft (GPL/AGPL) dependencies. Run `pnpm licenses list` to verify before submitting.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0 (same as the project). No CLA required.
