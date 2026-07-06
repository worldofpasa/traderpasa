FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS source
COPY . .
RUN pnpm --dir packages/db db:generate

FROM source AS web
ENV NODE_ENV=production
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "--filter", "@pasa-trader/web", "start"]

FROM source AS worker
ENV NODE_ENV=production
RUN pnpm typecheck
CMD ["pnpm", "--filter", "@pasa-trader/worker", "start"]
