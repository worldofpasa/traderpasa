#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

WORDS=(
  amber atlas brisk coral delta echo fable glade harbor ivory jade
  kinetic lemon maple nickel olive pearl quartz river satin timber
  ultra velvet walnut xenon yellow zest apple birch cedar daisy
  ember frost grape hazel iris juno kite lotus mango nectar opal
  prism quill radar slate terra umbra vivid willow yarn zebra
)

die() {
  echo "Error: $*" >&2
  exit 1
}

random_word() {
  echo "${WORDS[$((RANDOM % ${#WORDS[@]}))]}"
}

generate_postgres_user() {
  echo "$(random_word)$(random_word)$(random_word)"
}

generate_postgres_password() {
  echo "$(random_word)-$(random_word)-$(random_word)"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    die "Docker is not installed.

Install Docker first, then re-run:
  ./install.sh

  macOS/Windows: https://docs.docker.com/get-docker/
  Linux:         https://docs.docker.com/engine/install/"
  fi

  if ! docker compose version >/dev/null 2>&1; then
    die "Docker Compose v2 is not available.

Upgrade Docker or install the Compose plugin, then re-run:
  ./install.sh"
  fi

  if ! docker info >/dev/null 2>&1; then
    die "Docker is installed but the daemon is not running.

Start Docker Desktop (or the Docker service), then re-run:
  ./install.sh"
  fi
}

ensure_env_file() {
  if [[ -f .env ]]; then
    echo "Using existing .env"
    return
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    die "openssl is required to generate CREDENTIAL_ENCRYPTION_KEY."
  fi

  local encryption_key postgres_user postgres_password postgres_db database_url
  encryption_key="$(openssl rand -base64 32)"
  postgres_user="$(generate_postgres_user)"
  postgres_password="$(generate_postgres_password)"
  postgres_db="pasatrader"
  database_url="postgres://${postgres_user}:${postgres_password}@localhost:55432/${postgres_db}"

  cat > .env <<EOF
POSTGRES_DB=${postgres_db}
POSTGRES_USER=${postgres_user}
POSTGRES_PASSWORD=${postgres_password}
DATABASE_URL=${database_url}
AUTH_COOKIE_SECURE=false
CREDENTIAL_ENCRYPTION_KEY=${encryption_key}
NEXT_PUBLIC_APP_NAME=Pasa Trader Platform
EOF
  chmod 600 .env

  echo "Created .env with generated Postgres credentials and CREDENTIAL_ENCRYPTION_KEY."
  echo "Postgres user: ${postgres_user}"
  echo "Back up .env. Losing CREDENTIAL_ENCRYPTION_KEY makes stored broker and model credentials unreadable."
}

require_docker
ensure_env_file

echo "Building and starting Pasa Trader Platform..."
COMPOSE_BAKE=true docker compose up -d --build

echo ""
echo "Install complete."
echo "  App URL:  http://localhost:8080"
echo "  Health:   http://localhost:8080/api/health"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:8080/setup to create the first admin account."
echo "     SECURITY: the setup page is open to anyone who can reach this app"
echo "     until an admin exists. Complete it now, before exposing the app."
echo "  2. Add model and broker credentials in the app."
echo ""
echo "Manage the stack:"
echo "  docker compose ps"
echo "  docker compose logs -f web worker"
echo "  docker compose down"
