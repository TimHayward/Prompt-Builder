# syntax=docker/dockerfile:1

# Production image: dependencies, build, and a runtime that serves the built app.
FROM node:24-bookworm-slim AS base
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
# db:init runs the same migration list the application does, and resolves it as
# ../src/lib/migrations.mjs, so that one shared module has to travel with the
# script. Nothing else from src belongs here: Next inlines the migrations into
# the server bundle at build time, so the running app never reads this copy.
COPY --from=builder /app/src/lib/migrations.mjs ./src/lib/migrations.mjs
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# The data directory is the volume mount point, and .next holds the caches
# next start writes. Nothing else needs to be writable, so node_modules — by far
# the largest tree — keeps its build-time ownership. Chowning data matters at
# build time too: Docker seeds a new named volume from the image, ownership
# included, so a fresh deployment needs no correcting at all.
RUN mkdir -p /app/data \
    && chown -R node:node /app/data /app/.next \
    && chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

# No USER on purpose. The entrypoint needs root to correct the ownership of a
# volume left behind by an older build of this image, and gives it up before
# running the command below, so the application itself never runs as root.
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# db:init exits non-zero on failure, so a broken database stops the container
# here instead of being swallowed and serving a half-working application.
CMD ["sh", "-c", "npm run db:init && npm run start -- --hostname 0.0.0.0 --port \"$PORT\""]
