#!/usr/bin/env sh
set -eu

docker compose down "$@"
exec env COMPOSE_BAKE=true docker compose up -d --build "$@"
