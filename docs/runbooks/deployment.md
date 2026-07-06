# Pasa Trader Platform Deployment and Recovery Guide

This guide describes how to deploy, configure, backup, restore, and maintain the self-hosted Pasa Trader Platform.

## 1. Prerequisites and Setup

Pasa Trader is a modular monolith distributed via Docker Compose with a Caddy reverse proxy.

### 1.1 Requirements
- Docker and Docker Compose (v2+)
- A domain name (or localhost setup)
- Node.js (v20+) and `pnpm` (if running locally without containers)

### 1.2 Configuration (`.env`)
Create a `.env` file in the root directory. Example configuration:

```env
# Database (install.sh generates random POSTGRES_USER / POSTGRES_PASSWORD on first install)
POSTGRES_DB=pasatrader
POSTGRES_USER=pasatrader
POSTGRES_PASSWORD=pasatrader
# Host-side Prisma/CLI only — Compose services use postgres:5432 from POSTGRES_* above.
DATABASE_URL="postgresql://pasatrader:pasatrader@localhost:55432/pasatrader"

# Cookie security — set to true when serving over HTTPS in production.
AUTH_COOKIE_SECURE=false

# Credential Encryption Key (Must be 32 bytes encoded in Base64)
# Keep this secret safe! If lost, saved broker/model credentials cannot be decrypted.
CREDENTIAL_ENCRYPTION_KEY="base64-encoded-32-byte-key"

# Display name shown in the UI.
NEXT_PUBLIC_APP_NAME="Pasa Trader Platform"
```

## 2. Docker Compose Deployment

The platform is configured to run using the `compose.yaml` file in the root directory.

### 2.1 Caddy Reverse Proxy
Caddy routes incoming requests to the Next.js web application. The `Caddyfile` is configured as follows:

```caddyfile
:8080 {
    reverse_proxy web:3000
}
```

### 2.2 Starting the Platform

**Recommended first install** (checks Docker, creates `.env` with a generated encryption key, runs migrations and seed):

```bash
chmod +x install.sh
./install.sh
```

To start manually without the installer script:

```bash
docker compose up -d --build
```

From the repository root, you can also use the helper commands:

```bash
pnpm compose:up
pnpm compose:down
pnpm compose:restart
```

This starts:
- `postgres` (port 5432)
- `web` (Next.js server on port 3000)
- `worker` (Graphile Worker background job processor)
- `caddy` (Reverse proxy on port 8080)

## 3. Database Migration and Seeding

Docker Compose runs migrations and seed automatically via the `migrate` service (`db:prepare`: `prisma migrate deploy` then `prisma db seed`) before `web` and `worker` start.

To run migrations and seed manually outside Compose:

```bash
pnpm --filter @pasa-trader/db db:prepare
```

The seed script loads immutable strategy templates and the 12 Trading Desk built-in agent definitions. Built-in agents are also re-seeded on first-admin setup and when listing agent templates.

## 4. Backup and Recovery

### 4.1 Backing up the Database
To back up the PostgreSQL database running inside the Docker container, execute:

```bash
docker compose exec postgres pg_dump -U "${POSTGRES_USER:-pasatrader}" -d "${POSTGRES_DB:-pasatrader}" > backup_$(date +%F).sql
```

### 4.2 Restoring the Database
To restore a database backup:

1. Stop the web and worker containers to prevent active connection issues:
   ```bash
   docker compose stop web worker
   ```
2. Restore the SQL dump:
   ```bash
   docker compose exec -T postgres psql -U "${POSTGRES_USER:-pasatrader}" -d "${POSTGRES_DB:-pasatrader}" < backup_xxxx-xx-xx.sql
   ```
3. Restart the containers:
   ```bash
   docker compose start web worker
   ```

### 4.3 Encryption Key Warning
> [!CAUTION]
> The `CREDENTIAL_ENCRYPTION_KEY` environment variable is used to encrypt broker, model, and scraping credentials in the database using AES-256-GCM.
> If this key is lost, changed, or corrupted, **all encrypted credentials in the database will become unreadable**, and you will have to re-enter all broker and model keys in the Vault. Always back up this key securely in a password manager.

## 5. Safe Live-Trading Warnings

> [!WARNING]
> Live trading involves real capital and carries high financial risk.
> - **Always Test in Paper Mode First:** Verify strategy behavior, cron schedules, watchlist symbols, and trailing stop levels in Paper Trading environment before switching execution mode to LIVE.
> - **No Silent Live Upgrades:** Strategies are initialized in PAPER mode by default. Switching a strategy to LIVE requires explicit verification, checking broker capabilities, and accepting the regulatory risk agreement.
> - **Risk Settings Limits:** Configure maximum position size (`maxPositionPct`) and restricted ticker lists in the strategy editor to protect your capital.

## 6. Known Limitations
- **Broker Support:** Supports Alpaca and Interactive Brokers for paper/live US equities where account/API setup permits it.
- **Fractional Shares:** Only whole-share quantities are supported for broker execution.
- **Downtime Revalidation:** If the app loses connection to the broker during a scheduled run, execution blocks immediately, and notifications are sent. Stale orders are never backfilled or queued blindly.
