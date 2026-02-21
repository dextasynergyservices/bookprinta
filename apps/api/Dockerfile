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

# Copy workspace root files
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/bun.lock ./bun.lock

# Copy built API
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/src/generated ./apps/api/src/generated

# Copy workspace packages
COPY --from=builder --chown=nestjs:nodejs /app/packages/emails ./packages/emails
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared ./packages/shared

# Copy pre-built node_modules — no re-install needed
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules

USER nestjs

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "apps/api/dist/main.js"]