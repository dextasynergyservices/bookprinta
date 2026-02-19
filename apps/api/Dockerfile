# ─────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install Bun for faster installs
# Pin to same version as local development
RUN npm install -g bun@1.3.4

# Copy ALL workspace package.json files so lockfile resolves correctly
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

# Generate Prisma client (v7: outputs to prisma/generated/prisma/)
RUN cd apps/api && bunx prisma generate

# Build the NestJS app
RUN cd apps/api && bun run build

# ─────────────────────────────────────
# Stage 3: Production
# ─────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma/generated ./prisma/generated

USER nestjs

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]