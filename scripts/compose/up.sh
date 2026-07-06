#!/usr/bin/env sh
set -eu

exec env COMPOSE_BAKE=true docker compose up -d --build "$@"
