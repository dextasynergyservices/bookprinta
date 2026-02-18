# ─────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install Bun for faster installs
RUN npm install -g bun

COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile --production=false

# ─────────────────────────────────────
# Stage 2: Build
# ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (v7: outputs to prisma/generated/prisma/)
RUN cd apps/api && npx prisma generate

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
