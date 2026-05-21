# WS-8.9 — Production image for Bearcamp.
#
# Multi-stage build:
#   1. deps   — install (frozen) production deps for the final image.
#   2. build  — install dev deps + run `next build` to produce .next.
#   3. runner — copy only the standalone output + static assets.
#
# Assumes the consumer provides `DATABASE_URL` + `DIRECT_URL` +
# `BEARCAMP_BACKEND=prisma` + `BEARCAMP_ALLOWED_ORIGINS` at runtime.
# Migrations (`prisma migrate deploy`) and seeding (`prisma db seed`)
# are release-step concerns, not container-boot concerns.

ARG NODE_VERSION=20-alpine

# ----- deps --------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Prisma postinstall would run `prisma generate`, but the schema isn't
# yet copied here; we skip postinstall and re-run generate in the build
# stage where the schema is available.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ----- build -------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client now that the schema is present, then build.
# The build does not require a live DB — `prisma generate` reads only the
# schema file.
RUN pnpm exec prisma generate
RUN pnpm exec next build

# ----- runner ------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# If next.config sets `output: 'standalone'`, the build emits
# `.next/standalone`. We try to copy it; if it isn't emitted (no
# explicit output config), fall back to the default `next start` from
# the regular build output.
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

# `next start` reads the same build output the build stage produced. No
# standalone copy needed — keeps the image one moving part lighter at
# the cost of a slightly larger image size.
CMD ["node_modules/.bin/next", "start"]
