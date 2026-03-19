# BookPrinta

**Democratizing book publishing in Nigeria.** Authors upload raw manuscripts (DOCX/PDF) which are converted into professional, print-ready books via an automated formatting engine and a seamless e-commerce experience.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16 (App Router) | Hosted on Vercel |
| Backend | NestJS 11 (Monolith) | Hosted on Render (Docker) |
| Language | TypeScript 5 | Strict mode everywhere |
| Database | PostgreSQL 16 via Neon | Serverless + connection pooling |
| ORM | Prisma 7 | ESM, `@prisma/adapter-pg` driver |
| Cache / Queue | Upstash Redis + BullMQ | Background jobs |
| File Storage | Cloudinary | Signed uploads, raw resource type |
| Package Manager | Bun | Speed; runs in Node runtime |
| Styling | Tailwind CSS 4 | CSS-first config (no `tailwind.config.js`) |
| Components | Shadcn/UI | Tailwind v4 compatible |
| Animations | Framer Motion + GSAP + Lenis | Immersive scroll effects |
| State (Client) | Zustand 5 | Cart, pricing, questionnaire |
| State (Server) | TanStack Query 5 | Fetching, caching, optimistic updates |
| i18n | next-intl 4 | EN / FR / ES, locale routing via `proxy.ts` |
| PWA | Serwist | Service worker, precaching, offline support |
| AI | Gemini 1.5 Flash | Text cleaning + semantic HTML tagging |
| PDF Generation | Gotenberg 8 | Dockerized Chromium → print-ready PDF |
| Auth | Passport-JWT + HttpOnly Cookies | RBAC guards |
| Payments | Paystack, Stripe, PayPal, Bank Transfer | Configurable via admin |
| Email | Resend + React Email | Templates in `packages/emails/` |
| WhatsApp | Infobip | Automated notifications |
| Validation | Zod + nestjs-zod | Shared schemas → NestJS DTOs |
| Linting | Biome 2 | Replaces ESLint + Prettier |
| Error Tracking | Sentry | Frontend + backend |
| Testing | Jest + Playwright | Unit, integration, E2E |

---

## Repository Structure

```
bookprinta/
├── apps/
│   ├── web/                 # Next.js 16 Frontend
│   │   ├── app/             # App Router (pages, layouts)
│   │   │   └── [locale]/    # i18n: all routes wrapped in locale param
│   │   ├── components/      # UI, marketing, dashboard, admin, shared
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utilities, API client, i18n config
│   │   ├── messages/        # Translation JSON (en, fr, es)
│   │   ├── stores/          # Zustand stores
│   │   ├── styles/          # Global CSS, Tailwind theme
│   │   ├── types/           # Shared TypeScript types
│   │   ├── sw.ts            # Serwist service worker
│   │   └── proxy.ts         # Next.js 16 locale detection + routing
│   │
│   └── api/                 # NestJS Backend
│       ├── src/             # Modules: auth, users, orders, books, payments, etc.
│       ├── prisma/          # Schema, migrations, seed scripts
│       ├── test/            # Jest unit + integration tests
│       └── Dockerfile       # Multi-stage production build
│
├── packages/
│   ├── shared/              # Zod schemas, types, constants
│   └── emails/              # React Email transactional templates
│
├── e2e/                     # Playwright E2E tests
│   └── tests/               # Test specs
│
├── docs/                    # Project documentation
│   └── postman/             # Postman collection + environments
│
├── biome.json               # Biome linter + formatter config
├── turbo.json               # Turborepo task config
├── docker-compose.yml       # Local dev services
├── playwright.config.ts     # Playwright config
└── CLAUDE.md                # AI assistant instructions
```

---

## Prerequisites

```bash
node --version    # v22.x+ (LTS)
bun --version     # v1.x+
docker --version  # v24+
git --version     # v2.40+
```

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/dextasynergyservices/bookprinta.git
cd bookprinta
bun install
```

### 2. Environment Variables

Create environment files from the examples:

**Frontend** — `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
NEXT_PUBLIC_SENTRY_DSN=
```

**Backend** — `apps/api/.env`:

```env
DATABASE_URL=postgresql://bookprinta:bookprinta_dev@localhost:5432/bookprinta
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY_USER=7d
JWT_REFRESH_EXPIRY_ADMIN=1h
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PAYSTACK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GEMINI_API_KEY=
GOTENBERG_URL=http://localhost:3100
RESEND_API_KEY=
SENTRY_DSN=
FRONTEND_URL=http://localhost:3000
```

### 3. Start Docker Services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, Gotenberg, and ClamAV for local development.

### 4. Set Up the Database

```bash
cd apps/api
bunx prisma generate         # Generate Prisma client
bunx prisma db push           # Push schema to local database
bun run db:seed               # Seed packages, settings, etc.
bun run db:seed:admin         # Create a local admin user
```

### 5. Build Shared Packages

```bash
cd packages/shared && bun run build
cd ../emails && bun run build
```

### 6. Start Development Servers

```bash
# From the root — starts both frontend and backend
bun dev

# Or individually
bun dev --filter=web          # Frontend only (http://localhost:3000)
bun dev --filter=api          # Backend only (http://localhost:3001)
```

---

## Development Commands

### Root (Monorepo)

| Command | Description |
|---------|-------------|
| `bun dev` | Start all apps in development mode |
| `bun run build` | Build all apps and packages |
| `bun run check` | Biome lint + format check |
| `bun run check:fix` | Auto-fix lint + format issues |
| `bun run type-check` | TypeScript check across all packages |
| `bun run test` | Run all tests |
| `bun run test:e2e` | Run Playwright E2E tests |
| `bun run test:e2e:ui` | Playwright interactive UI mode |

### Frontend (`apps/web`)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Next.js dev server |
| `bun run build` | Production build |
| `bun run test` | Run Jest tests |
| `bun run test:watch` | Jest watch mode |
| `bun run test:cov` | Jest with coverage |
| `bun run typecheck` | TypeScript check |

### Backend (`apps/api`)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start NestJS with watch mode |
| `bun run build` | Production build |
| `bun run test` | Run Jest tests |
| `bun run test:unit` | Unit tests only |
| `bun run test:integration` | Integration tests only |
| `bun run test:cov` | Jest with coverage (80% threshold) |
| `bun run typecheck` | TypeScript check |

### Database (`apps/api`)

| Command | Description |
|---------|-------------|
| `bunx prisma generate` | Generate Prisma client |
| `bunx prisma db push` | Push schema to database (dev) |
| `bunx prisma migrate dev` | Create migration |
| `bunx prisma studio` | Visual database browser |
| `bun run db:seed` | Seed all base data |
| `bun run db:seed:admin` | Seed local admin user |
| `bun run db:seed:gateways` | Seed payment gateways |
| `bun run db:seed:resources` | Seed blog resources |
| `bun run db:seed:showcase` | Seed showcase entries |

---

## Docker Services

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| PostgreSQL 16 | `bookprinta-db` | 5432 | Database (production uses Neon) |
| Redis 7 | `bookprinta-redis` | 6379 | Cache + BullMQ (production uses Upstash) |
| Gotenberg 8 | `bookprinta-gotenberg` | 3100 | PDF generation engine |
| ClamAV | `bookprinta-clamav` | 3310 | Malware scanning for uploads |

```bash
docker compose up -d          # Start all services
docker compose down           # Stop all services
docker compose logs -f gotenberg  # Follow specific service logs
docker compose ps             # Check service status
```

---

## Testing

### Unit & Integration Tests (Jest)

```bash
# Backend
cd apps/api
bun run test                  # All tests
bun run test:unit             # Unit tests only
bun run test:cov              # With coverage (80% threshold)

# Frontend
cd apps/web
bun run test                  # All tests
bun run test:cov              # With coverage
```

### E2E Tests (Playwright)

```bash
# From root
bunx playwright install       # Install browsers (first time)
bun run test:e2e              # Run all E2E tests
bun run test:e2e:ui           # Interactive UI mode

# Specific test files
bunx playwright test e2e/tests/auth.spec.ts
bunx playwright test e2e/tests/checkout.spec.ts
```

**Playwright projects:** Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari.

---

## API Documentation

- **Swagger UI:** `http://localhost:3001/api/docs` (available in development)
- **OpenAPI JSON:** `http://localhost:3001/api/docs-json`
- **Postman Collection:** `docs/postman/BookPrinta.postman_collection.json`
- **Postman Environments:** `docs/postman/environments/`

---

## Internationalization (i18n)

BookPrinta supports 3 languages: **English**, **French**, **Spanish**.

- Translation files: `apps/web/messages/{en,fr,es}.json`
- `en.json` is the source of truth — always add new keys there first
- All user-facing strings use `useTranslations()` — no hardcoded text
- Backend emails/notifications use the user's `preferredLanguage` field
- Locale routing via `proxy.ts` (Next.js 16 pattern, not middleware)

---

## Deployment

| Service | Platform | Trigger |
|---------|----------|---------|
| Frontend | Vercel | Auto-deploy on push to `main` |
| Backend | Render (Docker) | Auto-deploy on push to `main` |
| Gotenberg | Render (separate service) | Manual deploy |
| Database | Neon PostgreSQL | Serverless, always on |
| Redis | Upstash | Serverless, always on |

### CI/CD

- **CI Pipeline** (`ci.yml`): Runs on every PR — Biome lint, typecheck, Prisma generate, build
- **Deploy Production** (`deploy-production.yml`): Runs on push to `main` — validates build

---

## Git Workflow

```
main          ← Production (protected, requires PR)
  └── develop ← Integration branch (protected)
       └── feature/*, fix/*, chore/* ← Feature branches
```

**Commit convention:** `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `ci:`

**Git hooks (Husky):**
- **Pre-commit:** `lint-staged` — Biome check on staged files
- **Pre-push:** `typecheck` — TypeScript check across all packages

---

## Key Architecture Decisions

- **No Next.js API routes** — All API logic lives in NestJS. No `app/api/` in the frontend.
- **Zod as single source of truth** — Schemas defined in `packages/shared/schemas/`, used by both frontend and backend via `createZodDto()`.
- **JWT in HttpOnly cookies** — Never in localStorage. Refresh token rotation with short-lived access tokens (15min).
- **Gotenberg on separate service** — PDF rendering is resource-heavy (Chromium). Isolated to prevent API crashes.
- **ClamAV mandatory** — All file uploads are malware-scanned before Cloudinary storage. Uploads blocked if ClamAV is down.
- **Webhook idempotency** — All payment webhooks check `providerRef` + `processedAt` before processing.
- **Optimistic concurrency** — `version` field on Order and Book models prevents race conditions on status updates.
- **Mobile-first CSS** — Base styles target mobile (375px), enhanced with `md:` and `lg:` breakpoints.

---

## License

Private — All rights reserved.
