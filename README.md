# Hotelia

Cloud-native, all-in-one hotel management platform for boutique hotels and mid-market hotel
groups (20–200 rooms). Replaces fragmented legacy systems (PMS, RMS, CRS, POS, CRM, Work Order
Management, Guest Communication) with a single unified, event-driven data core.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete technical blueprint, including:

- Modular monolith + Redis Streams event backbone
- Full PostgreSQL schema (18+ tables across all modules)
- Module-by-module functional specs
- MVP roadmap and deployment strategy

## Monorepo Structure

```
hotelia/
├── apps/
│   ├── web/     # Staff dashboard (Next.js 16, port 3000)
│   ├── guest/   # Guest PWA (Next.js 16, port 3001) — offline-first
│   └── kds/     # Kitchen Display System (Next.js 16, port 3002)
├── packages/
│   ├── database/    # Prisma schema, client, seed (PostgreSQL)
│   ├── shared/      # Shared types, validators (Zod), constants, utils
│   ├── events/      # Domain event bus (Redis Streams) + handler registry
│   ├── channels/    # OTA adapters (Booking.com, Expedia, Airbnb, Direct)
│   └── integrations/# Smart locks, PBX, payment hardware adapters
└── infra/
    ├── docker/      # Dockerfile + docker-compose (Postgres, Redis, etc.)
    └── github-actions/
```

## Prerequisites

- Node.js 22+
- npm 11+
- Docker (for local database)

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure (Postgres, Redis, Adminer, Mailpit)
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Copy environment variables
cp .env.example .env

# 4. Generate Prisma client + push schema + seed
npm run db:generate
npm run db:push
npm run db:seed

# 5. Start all apps in dev mode
npm run dev
```

Apps:

- **Staff dashboard:** http://localhost:3000 (/login)
- **Guest PWA:** http://localhost:3001
- **Kitchen display:** http://localhost:3002
- **Adminer (DB viewer):** http://localhost:8080
- **Mailpit (email testing):** http://localhost:8025

## Common Commands

| Command              | Description                      |
| -------------------- | -------------------------------- |
| `npm run dev`        | Run all apps in development mode |
| `npm run build`      | Build all apps and packages      |
| `npm run typecheck`  | Type-check all apps and packages |
| `npm run lint`       | Lint all apps and packages       |
| `npm run db:studio`  | Open Prisma Studio               |
| `npm run db:migrate` | Create a new migration           |

## Domain Events

The system is event-driven. Modules communicate via a shared domain event bus (Redis Streams)
rather than direct calls:

```
reservation.checked_in → housekeeping, CRM, POS activation, `role` messaging
room.status_changed    → front desk tape chart, revenue management
order.placed           → kitchen display, folio posting
daily_rate.changed     → channel manager (OTA sync)
guest.message_received → AI agent, staff inbox
```

See `packages/events/src/definitions/` for the full event schema.

## Security & Compliance

- **PCI-DSS:** Card data never touches Hotelia servers — Stripe Elements tokenize at client side
  (SAQ A scope)
- **GDPR:** Guest PII encrypted at rest; consent tracking; right-to-access and right-to-erasure
  APIs
- **RBAC:** Role-based access control across owner → readonly with property-level isolation

## License

Private / proprietary. Not licensed for redistribution.
