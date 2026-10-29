# syntax=docker/dockerfile:1.7
#
# BookPrinta API image (Render). Build from the monorepo root:
#   docker build -f apps/api/Dockerfile -t bookprinta-api .
#
# Goals: reproducible installs (frozen lockfile), no dev dependencies or build
# tooling in the runtime image (smaller image → faster cold starts on Render's
# free tier), and a heap ceiling that keeps Node under the 512 MB instance.

ARG NODE_IMAGE=node:22-alpine
# Keep in step with "packageManager" in the root package.json.
ARG BUN_VERSION=1.3.8

# ─────────────────────────────────────
# Base: Node + Bun (build stages only)
# ─────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ARG BUN_VERSION
RUN npm install -g "bun@${BUN_VERSION}"
WORKDIR /app

# Every workspace manifest, so the frozen lockfile resolves exactly.
FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/emails/package.json ./packages/emails/

# ─────────────────────────────────────
# Stage 1: all dependencies (for building)
# ─────────────────────────────────────
FROM manifests AS deps
RUN bun install --frozen-lockfile --filter api --filter @bookprinta/shared --filter @bookprinta/emails

# ─────────────────────────────────────
# Stage 2: build
# ─────────────────────────────────────
FROM deps AS builder
COPY . .
RUN cd apps/api && bun x prisma generate
RUN cd packages/shared && bun run build
RUN cd packages/emails && bun run build
RUN cd apps/api && bun run build

# ─────────────────────────────────────
# Stage 3: production dependencies only
# ─────────────────────────────────────
FROM manifests AS prod-deps
RUN bun install --frozen-lockfile --production --filter api --filter @bookprinta/shared --filter @bookprinta/emails

# ─────────────────────────────────────
# Stage 4: runtime (Node only — no Bun, no dev deps, no sources)
# ─────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/src/generated ./apps/api/src/generated

COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
# Bun's isolated linker gives each workspace its own node_modules of links into
# /app/node_modules/.bun — these must ship too (shared resolves zod here).
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages/emails/package.json ./packages/emails/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/emails/dist ./packages/emails/dist
COPY --from=prod-deps --chown=nestjs:nodejs /app/packages/emails/node_modules ./packages/emails/node_modules

USER nestjs

EXPOSE 3001
ENV PORT=3001 \
    NODE_ENV=production \
    # Make V8 collect garbage before the container hits Render's 512 MB limit,
    # instead of growing until the kernel OOM-kills the process. Leaves room
    # for native memory (Prisma, sharp-free buffers, TLS).
    NODE_OPTIONS=--max-old-space-size=384

CMD ["node", "apps/api/dist/main.js"]
