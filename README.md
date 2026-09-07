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

**Product decision:** the property team operates a native **desktop console**, not websites.
Only the guest zero-download interface and the kitchen/tablet displays remain web touchpoints.

## Monorepo Structure

```
hotelia/
├── apps/
│   ├── console/ # Desktop console (Electron + React). Front desk, housekeeping, POS,
│   │            #   messaging, work orders, revenue. Offline-first with local backend
│   │            #   (REST + SSE broker on :3110) and LAN lock-encoder bridge. Run: electron .
│   ├── guest/   # Guest PWA (Next.js 16, port 3001) — offline-first
│   └── kds/     # Kitchen Display System (Next.js 16, port 3002) — live SSE stream
├── packages/
│   ├── database/    # Prisma schema, client, seed (PostgreSQL); inventory-lock + ledger services
│   ├── shared/      # Types, validators (Zod), constants, utils, TaxEngine
│   ├── events/      # Domain event bus (Redis Streams) + handler registry + registry
│   ├── channels/    # OTA adapters (Booking.com, Expedia, Airbnb, Direct) — Net+tax normalized
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

- **Desktop console:** `npm --workspace @hotelia/console run build` then `npm --workspace @hotelia/console run start`,
  or dev with `npm --workspace @hotelia/console run dev` + `npm --workspace @hotelia/console run dev:electron`.
  Embeds the local REST + SSE broker at `http://localhost:3110` and the offline sync / lock-bridge daemon.
- **Guest PWA:** http://localhost:3001
- **Kitchen display:** http://localhost:3002 (live via SSE, auto-reconnect)
- **Adminer (DB viewer):** http://localhost:8080
- **Mailpit (email testing):** http://localhost:8025

## Resilience & Financial-Controls Notes (hardening pass)

| Concern                         | Where it lives                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Offline front desk (Wi-Fi drop) | `apps/console` — IndexedDB + disk queue, `lockBridge` TCP/serial encode, `OfflineSyncEngine`              |
| Multi-folio split billing       | `Folio.type` (MASTER/COMPANY/PERSONAL/SPLIT), `FolioTransfer`, `transferFolioItem` in `@hotelia/database` |
| POS charge disputes             | `PosOrder.validation/deviceFingerprint/ipAddress/sessionId`, `GuestSession` token model                   |
| Overbooking race                | `atomicReserveRoom` / `lockChannelInventory` — `SELECT … FOR UPDATE` under Serializable isolation         |
| Night-audit immutability        | `BusinessDay` freeze + `closeBusinessDay`; corrections only via `reverseLineItem` reversal ledger         |
| OTA tax parity                  | `TaxEngine.normalizeRate` in `@hotelia/shared`; every adapter emits Net + itemized tax                    |
| KDS staleness                   | SSE `/stream` broker on the console (heartbeat, auto-reconnect) instead of REST polling                   |

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
