# syntax=docker/dockerfile:1

# Production image: dependencies, build, and a runtime that serves the built app.
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# better-sqlite3 is a native module; the toolchain covers platforms with no prebuild.
FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# node_modules carries the compiled better-sqlite3 binding and the loader for
# the TypeScript next.config, so it is copied whole rather than pruned.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# The data directory is a volume mount point; create it so a first run works.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

# db:init exits non-zero on failure, so a broken database stops the container
# here instead of being swallowed and serving a half-working application.
CMD ["sh", "-c", "npm run db:init && npm run start -- --hostname 0.0.0.0 --port \"$PORT\""]
