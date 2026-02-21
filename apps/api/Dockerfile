# ─────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN npm install -g bun@1.3.4

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/emails/package.json ./packages/emails/

RUN bun install

# ─────────────────────────────────────
# Stage 2: Build
# ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g bun@1.3.4

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Re-run install at monorepo root to fix workspace symlinks (deps stage only had package.jsons)
RUN bun install

# Generate Prisma client
RUN cd apps/api && bun x prisma generate

# Build the NestJS app
RUN cd apps/api && bun run build

# ─────────────────────────────────────
# Stage 3: Production
# ─────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN npm install -g bun@1.3.4

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy workspace root package.json + lockfile (needed for workspace resolution)
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/bun.lock ./bun.lock

# Copy API dist + config
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/src/generated ./apps/api/src/generated

# Copy workspace packages (emails + shared) so bun can resolve workspace:* deps
COPY --from=builder --chown=nestjs:nodejs /app/packages/emails ./packages/emails
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared ./packages/shared

# Install production deps within workspace context
RUN bun install --production --ignore-scripts --no-frozen-lockfile

USER nestjs

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "apps/api/dist/main.js"]