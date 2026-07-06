# TraderPasa

> **WARNING: This software executes real trades with real money.**
> Always test in paper trading mode first. See [NOTICE](NOTICE) for the full risk disclaimer.

TraderPasa is a self-hosted operating system for automated trading. It turns strategy templates into repeatable automations using evidence collection, AI synthesis, proposed orders, deterministic risk validation, broker execution, dashboards, and safety controls.

**What it is not:**
- Financial advice
- A guaranteed-return product
- A custody service
- A public strategy marketplace

Designed for a single technical operator running their own trading automation on their own infrastructure.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Caddy (TLS)                     │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────▼──────────────┐
         │     Next.js Web App        │  App Router · REST · OpenAPI · Zod
         └─────────────┬──────────────┘
                       │  PostgreSQL (Prisma)
         ┌─────────────▼──────────────┐
         │    Graphile Worker         │  Background jobs · Agent workflows
         └─────────────┬──────────────┘
                       │
         ┌─────────────▼──────────────┐
         │    Broker Adapters         │  Alpaca · Interactive Brokers
         └────────────────────────────┘
```

**Stack:** TypeScript · Next.js 16 · PostgreSQL 17 · Prisma · Graphile Worker · Tailwind · shadcn/ui · Docker Compose · Caddy

**AI:** Bring-your-own API key. Supports OpenAI, Anthropic, and any OpenAI-compatible provider (Ollama, vLLM, LM Studio).

---

## Quickstart

**Requirements:** Docker with Compose v2

```bash
git clone https://github.com/worldofpasa/traderpasa.git
cd traderpasa
./install.sh
```

The installer checks for Docker, generates a `.env` with randomised Postgres credentials and an encryption key, builds the images, and starts the stack.

```
App:    http://localhost:8080
Health: http://localhost:8080/api/health
```

> **Complete `/setup` immediately** after the app starts. The first-admin setup endpoint is open to anyone with network access until you create an account. Do not expose the app to the internet before this step.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES-256-GCM key for broker/model credentials. Generate with `openssl rand -base64 32`. **Back this up — losing it makes all stored credentials unreadable.** |
| `DATABASE_URL` | Yes | Postgres connection string. Set automatically by `install.sh`. |
| `POSTGRES_DB` | Yes | Database name (default: `pasatrader`). |
| `POSTGRES_USER` | Yes | Database user. Randomised by `install.sh`. |
| `POSTGRES_PASSWORD` | Yes | Database password. Randomised by `install.sh`. |
| `AUTH_COOKIE_SECURE` | No | Set to `true` in production (HTTPS). Default: `false`. |
| `NEXT_PUBLIC_APP_NAME` | No | Display name shown in the UI. Default: `Pasa Trader Platform`. |
| `ALPACA_WEBHOOK_SECRET` | No | Shared secret for the Alpaca order-event webhook. Leave unset to disable the endpoint. |
| `DOMAIN` | Prod only | Domain for automatic TLS via Caddy (e.g. `trader.example.com`). |

Broker API keys, LLM API keys, and scraping credentials are stored encrypted in the database — never in `.env`.

---

## Production Deployment

For internet-facing deployments:

1. Point your domain's DNS at the server.
2. Copy `.env.example` to `.env`, fill in `POSTGRES_*`, generate `CREDENTIAL_ENCRYPTION_KEY`, and set `DOMAIN=your.domain.com` and `AUTH_COOKIE_SECURE=true`.
3. Replace `Caddyfile` with `Caddyfile.prod`:

```caddyfile
{$DOMAIN} {
    reverse_proxy web:3000
}
```

4. Start the stack:

```bash
docker compose up -d --build
```

Caddy obtains a Let's Encrypt certificate automatically.

---

## Backup

A backup is your **database dump plus your `.env` file** (the encryption key lives there).

```bash
# Database dump
docker compose exec postgres pg_dump \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > backup_$(date +%F).sql

# Also back up .env — it contains CREDENTIAL_ENCRYPTION_KEY
cp .env .env.backup.$(date +%F)
```

Store both somewhere safe (password manager, encrypted storage). Without the key, the database dump is useless.

---

## Using Ollama / Local LLMs

TraderPasa supports any OpenAI-compatible provider. In the app's Vault, add a model credential with:
- Provider: `openai-compatible`
- Base URL: your Ollama/vLLM/LM Studio endpoint (e.g. `http://localhost:11434/v1`)
- Model: the model name (e.g. `llama3.2`)

No code changes required.

---

## Stack Commands

```bash
./install.sh          # First install
pnpm compose:up       # Start stack
pnpm compose:down     # Stop stack
pnpm compose:restart  # Rebuild and restart

pnpm test             # Unit tests
pnpm test:integration # Integration tests (requires Postgres)
pnpm test:e2e         # Playwright end-to-end tests
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the threat model and how to report vulnerabilities.

## License

Apache-2.0 — see [LICENSE](LICENSE).

**This software is provided AS IS, with no warranty. You are solely responsible for all trading outcomes.**
