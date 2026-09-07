# Hotelia — Technical Architecture & Product Blueprint

> **Version:** 1.0 | **Date:** September 2026
> **Classification:** Internal — Confidential
> **Prepared by:** Office of the CTO & Principal Product Architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview & Architectural Principles](#2-product-overview--architectural-principles)
3. [System Architecture](#3-system-architecture)
4. [Data Model & Unified Schema](#4-data-model--unified-schema)
5. [Module Specifications](#5-module-specifications)
6. [Technical Stack & Infrastructure](#6-technical-stack--infrastructure)
7. [Security, Compliance & Hardware Integration](#7-security-compliance--hardware-integration)
8. [Development Roadmap & MVP Phases](#8-development-roadmap--mvp-phases)
9. [Appendices](#9-appendices)

---

## 1. Executive Summary

Hotelia is a **cloud-native, all-in-one hotel management platform** built to replace fragmented legacy systems — PMS, RMS, CRS, POS, CRM, Work Order Management, and Guest Communication — with a **single unified data core** powered by an event-driven architecture.

The platform targets **independent boutique hotels and mid-market hotel groups (20–200 rooms per property)**, delivering:

- **Zero-latency synchronization** across all operational modules via a shared event bus
- **Mobile-first operational UX** for staff on tablets and phones
- **Zero-download guest interface** via progressive web applications (PWA)
- **Offline-first front-desk capability** ensuring continuity during network outages
- **PCI-DSS Level 1 / GDPR compliance** baked into every data path

---

## 2. Product Overview & Architectural Principles

### 2.1 Core Value Proposition

| Legacy Pain Point                       | Hotelia Solution                                                         |
| --------------------------------------- | ------------------------------------------------------------------------ |
| PMS ↔ RMS ↔ POS sync failures           | Single event-driven database; all modules read/write one source of truth |
| 2-hour night audit shutdowns            | Continuous financial ledger with real-time audit trail                   |
| API latency from third-party connectors | Native channel manager engine, no middleware hops                        |
| Per-integration licensing costs         | All modules included in one platform                                     |
| Guest app downloads required            | PWA with QR-code entry points                                            |

### 2.2 Architectural Principles

| #   | Principle                                  | Rationale                                                                             |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| P1  | **Single Source of Truth**                 | One canonical data model; no shadow databases or sync replicas                        |
| P2  | **Event-Driven by Default**                | Every state change emits a domain event; consumers subscribe, not poll                |
| P3  | **Offline-First Front Desk**               | Critical operations continue without network; sync when reconnected                   |
| P4  | **Mobile-First, Not Mobile-Also**          | All staff interfaces designed for tablet/phone first, desktop second                  |
| P5  | **Zero-Download Guest Experience**         | PWA install prompt only; core flows work without installation                         |
| P6  | **Compliance by Architecture**             | PCI-DSS and GDPR requirements enforced at the data layer, not bolted on               |
| P7  | **Modular Monolith, Not Microservices**    | Single deployable unit with strict domain boundaries; extract only when scale demands |
| P8  | **Offline-Capable, Not Offline-Dependent** | Graceful degradation; queue mutations locally and reconcile on reconnect              |

---

## 3. System Architecture

### 3.1 Architecture Style: Modular Monolith with Event Backbone

**Why not microservices?** For a hospitality platform serving 20–200 room properties, the operational complexity of microservices (service mesh, distributed tracing, inter-service auth, deployment orchestration) is unjustified. A **modular monolith** with strict domain boundaries provides:

- **Simpler deployment** — one container, one database, one transaction boundary
- **Strong consistency** — folio transactions, inventory locks, and reservation commits are atomic
- **Lower operational cost** — no Kubernetes cluster needed at initial scale
- **Future extraction path** — each module is a candidate for service extraction if traffic demands it

**The event backbone** (Redis Streams) provides asynchronous cross-module communication without coupling.

### 3.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Staff Web    │  │  Staff PWA   │  │  Guest PWA   │  │  Physical     │   │
│  │  Dashboard    │  │  (Tablet)    │  │  (Mobile)    │  │  POS Terminal │   │
│  │  Next.js SSR  │  │  Next.js     │  │  Next.js     │  │  React Native │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │                  │           │
│         └──────────────────┴──────────────────┴──────────────────┘           │
│                                      │                                       │
│                              ┌───────┴───────┐                               │
│                              │  API Gateway   │                               │
│                              │  (Next.js API  │                               │
│                              │   Routes +     │                               │
│                              │   Middleware)  │                               │
│                              └───────┬───────┘                               │
├──────────────────────────────────────┼───────────────────────────────────────┤
│                         APPLICATION LAYER                                    │
│                                      │                                       │
│  ┌───────────────────────────────────┼─────────────────────────────────────┐ │
│  │              MODULAR MONOLITH (Node.js / TypeScript)                    │ │
│  │                                   │                                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────┴────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │   PMS    │ │   RMS    │ │   POS    │ │   CRM    │ │  Work    │     │ │
│  │  │  Module  │ │  Module  │ │  Module  │ │  Module  │ │  Orders  │     │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │ │
│  │       │            │            │            │            │             │ │
│  │       └────────────┴─────┬──────┴────────────┴────────────┘             │ │
│  │                          │                                              │ │
│  │               ┌──────────┴──────────┐                                   │ │
│  │               │   Domain Event Bus  │                                   │ │
│  │               │   (Redis Streams)   │                                   │ │
│  │               └──────────┬──────────┘                                   │ │
│  └──────────────────────────┼──────────────────────────────────────────────┘ │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                           │
│         │                   │                   │                           │
│  ┌──────┴──────┐   ┌───────┴──────┐   ┌───────┴──────┐                    │
│  │  Payment    │   │  Channel     │   │  External    │                    │
│  │  Gateway    │   │  Manager     │   │  Integrations│                    │
│  │  (Stripe)   │   │  Engine      │   │  (Locks,     │                    │
│  └─────────────┘   └──────────────┘   │   PBX, etc.) │                    │
│                                       └──────────────┘                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                           DATA LAYER                                        │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  PostgreSQL 16+  │  │  Redis 7+    │  │  S3/R2       │                  │
│  │  (Primary OLTP)  │  │  (Cache,     │  │  (File       │                  │
│  │  + pgvector      │  │   Sessions,  │  │   Storage:   │                  │
│  │  + TimescaleDB   │  │   Events,    │  │   ID docs,   │                  │
│  │                  │  │   Real-time) │  │   receipts)  │                  │
│  └──────────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Event-Driven Communication Flow

```
  Guest checks in via PWA
         │
         ▼
  ┌─────────────┐
  │  PMS Module  │──emits──▶ reservation.checked_in
  └─────────────┘
         │
         ├──▶ RMS Module  → adjusts available inventory count
         ├──▶ CRM Module  → updates guest profile, stay count
         ├──▶ POS Module  → activates guest's room charge capability
         ├──▶ Work Orders → triggers housekeeping: "room occupied"
         └──▶ Messaging   → sends welcome SMS/WhatsApp to guest

  Each consumer handles its own event independently.
  No module calls another module directly.
```

### 3.4 Offline-First Architecture

```
┌─────────────────────────────────────────────┐
│            Front Desk (Tablet PWA)          │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  IndexedDB (Dexie.js)                   ││
│  │  - Room inventory snapshot              ││
│  │  - Today's arrivals/departures          ││
│  │  - Guest lookup cache                   ││
│  │  - Pending mutations queue              ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  Service Worker                         ││
│  │  - Cache-first for static assets        ││
│  │  - Network-first for API calls          ││
│  │  - Queue POST/PUT when offline          ││
│  │  - Replay queue on reconnect            ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Online: API ←→ PostgreSQL                  │
│  Offline: Local IndexedDB ←→ Queue          │
│  Reconcile: Sync engine resolves conflicts  │
└─────────────────────────────────────────────┘
```

---

## 4. Data Model & Unified Schema

### 4.1 Core Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│  Property    │1────M│  Room             │1────M│  Reservation │
│              │       │                  │       │              │
│  id          │       │  id              │       │  id          │
│  name        │       │  property_id     │       │  room_id     │
│  address     │       │  number          │       │  guest_id    │
│  timezone    │       │  type            │       │  check_in    │
│  currency    │       │  floor           │       │  check_out   │
│  config      │       │  status          │       │  status      │
└──────────────┘       │  amenities       │       │  rate_plan   │
                       │  base_rate       │       │  total       │
                       │  locks[protocol] │       │  folio_id    │
                       └──────────────────┘       └──────┬───────┘
                                                        │
                                               1        │ M
                                               ┌────────┴────────┐
                                               │  Folio           │
                                               │                  │
                                               │  id              │
                                               │  reservation_id  │
                                               │  guest_id        │
                                               │  balance         │
                                               │  currency        │
                                               │  status          │
                                               └────────┬────────┘
                                                        │
                                               1        │ M
                                               ┌────────┴────────┐
                                               │  FolioLineItem   │
                                               │                  │
                                               │  id              │
                                               │  folio_id        │
                                               │  description     │
                                               │  amount          │
                                               │  tax_amount      │
                                               │  source_module   │
                                               │  posted_at       │
                                               └─────────────────┘

┌──────────────┐       ┌──────────────────┐
│  Guest       │1────M│  GuestStay        │
│  (CRM)       │       │  (Stay History)   │
│              │       │                  │
│  id          │       │  id              │
│  name        │       │  guest_id        │
│  email       │       │  property_id     │
│  phone       │       │  reservation_id  │
│  dob         │       │  check_in        │
│  nationality │       │  check_out       │
│  id_doc_url  │       │  room_type       │
│  preferences │       │  spend_total     │
│  notes       │       │  notes           │
│  tags[]      │       │  satisfaction    │
└──────────────┘       └──────────────────┘
```

### 4.2 Database Schema (PostgreSQL)

#### 4.2.1 Properties & Rooms

```sql
CREATE TABLE properties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100),
    state           VARCHAR(100),
    country         VARCHAR(3) NOT NULL,         -- ISO 3166-1 alpha-3
    postal_code     VARCHAR(20),
    timezone        VARCHAR(50) NOT NULL,         -- IANA tz
    currency        VARCHAR(3) NOT NULL,          -- ISO 4217
    phone           VARCHAR(20),
    email           VARCHAR(255),
    config          JSONB NOT NULL DEFAULT '{}',  -- property-specific overrides
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE room_status AS ENUM (
    'vacant_dirty', 'vacant_clean', 'vacant_inspected',
    'occupied_dirty', 'occupied_clean',
    'out_of_order', 'out_of_service'
);

CREATE TYPE room_type AS ENUM (
    'standard', 'superior', 'deluxe', 'suite', 'penthouse', 'villa'
);

CREATE TABLE rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    number          VARCHAR(10) NOT NULL,
    floor           SMALLINT,
    type            room_type NOT NULL,
    status          room_status NOT NULL DEFAULT 'vacant_dirty',
    base_rate       DECIMAL(10,2),
    max_occupancy   SMALLINT NOT NULL DEFAULT 2,
    bed_config      VARCHAR(50),                  -- e.g. "king", "2x twin"
    amenities       TEXT[] DEFAULT '{}',
    lock_protocol   VARCHAR(50),                  -- 'ble', 'nfc', 'pin', NULL
    lock_device_id  VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_id, number)
);

CREATE INDEX idx_rooms_property_status ON rooms(property_id, status);
CREATE INDEX idx_rooms_property_type ON rooms(property_id, type);
```

#### 4.2.2 Guests & CRM

```sql
CREATE TABLE guests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    phone_country   VARCHAR(3),
    date_of_birth   DATE,
    nationality     VARCHAR(3),
    gender          VARCHAR(20),
    id_document_type VARCHAR(50),                -- 'passport', 'national_id', 'drivers_license'
    id_document_url TEXT,                         -- encrypted URL to S3/R2
    dietary_prefs   TEXT[] DEFAULT '{}',
    accessibility   TEXT[] DEFAULT '{}',
    language_pref   VARCHAR(5) DEFAULT 'en',
    notes           TEXT,
    tags            TEXT[] DEFAULT '{}',
    lifetime_spend  DECIMAL(12,2) DEFAULT 0,
    stay_count      INTEGER DEFAULT 0,
    avatar_url      TEXT,
    consent_pii     BOOLEAN NOT NULL DEFAULT FALSE,
    consent_pii_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guests_email ON guests(email) WHERE email IS NOT NULL;
CREATE INDEX idx_guests_phone ON guests(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_guests_property ON guests(property_id);

CREATE TABLE guest_stays (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID NOT NULL REFERENCES guests(id),
    property_id     UUID NOT NULL REFERENCES properties(id),
    reservation_id  UUID NOT NULL,
    check_in        TIMESTAMPTZ,
    check_out       TIMESTAMPTZ,
    room_type       room_type,
    room_number     VARCHAR(10),
    nights          SMALLINT,
    spend_total     DECIMAL(12,2) DEFAULT 0,
    satisfaction    SMALLINT,                     -- 1-5 post-stay rating
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stays_guest ON guest_stays(guest_id);
CREATE INDEX idx_stays_property ON guest_stays(property_id);
```

#### 4.2.3 Reservations & Folio

```sql
CREATE TYPE reservation_status AS ENUM (
    'pending', 'confirmed', 'checked_in', 'checked_out',
    'cancelled', 'no_show'
);

CREATE TABLE reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    guest_id        UUID NOT NULL REFERENCES guests(id),
    room_id         UUID REFERENCES rooms(id),
    confirmation_no VARCHAR(20) UNIQUE NOT NULL,
    source          VARCHAR(50) NOT NULL,         -- 'direct', 'booking.com', 'expedia', 'airbnb', 'phone', 'walk-in'
    status          reservation_status NOT NULL DEFAULT 'pending',
    check_in_date   DATE NOT NULL,
    check_out_date  DATE NOT NULL,
    adults          SMALLINT NOT NULL DEFAULT 1,
    children        SMALLINT DEFAULT 0,
    room_type       room_type NOT NULL,
    rate_plan       VARCHAR(100),
    nightly_rate    DECIMAL(10,2) NOT NULL,
    total_amount    DECIMAL(12,2) NOT NULL,
    deposit_paid    DECIMAL(10,2) DEFAULT 0,
    currency        VARCHAR(3) NOT NULL,
    special_requests TEXT,
    isVIP           BOOLEAN DEFAULT FALSE,
    assigned_room   UUID REFERENCES rooms(id),
    checked_in_at   TIMESTAMPTZ,
    checked_out_at  TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancellation_reason TEXT,
    ota_reservation_id VARCHAR(255),              -- sync reference
    channel_metadata JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_dates ON reservations(property_id, check_in_date, check_out_date);
CREATE INDEX idx_reservations_status ON reservations(property_id, status);
CREATE INDEX idx_reservations_guest ON reservations(guest_id);
CREATE INDEX idx_reservations_room ON reservations(room_id) WHERE room_id IS NOT NULL;

CREATE TYPE folio_status AS ENUM ('open', 'closed', 'disputed', 'written_off');

CREATE TABLE folios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id  UUID NOT NULL REFERENCES reservations(id),
    guest_id        UUID NOT NULL REFERENCES guests(id),
    property_id     UUID NOT NULL REFERENCES properties(id),
    status          folio_status NOT NULL DEFAULT 'open',
    currency        VARCHAR(3) NOT NULL,
    balance         DECIMAL(12,2) NOT NULL DEFAULT 0,
    posted_at       TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE line_item_source AS ENUM (
    'room', 'pos_food', 'pos_beverage', 'pos_retail',
    'minibar', 'spa', 'laundry', 'parking',
    'tax', 'discount', 'adjustment', 'payment', 'refund'
);

CREATE TABLE folio_line_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio_id        UUID NOT NULL REFERENCES folios(id),
    source_module   line_item_source NOT NULL,
    description     VARCHAR(500) NOT NULL,
    quantity        DECIMAL(8,2) DEFAULT 1,
    unit_price      DECIMAL(10,2) NOT NULL,
    tax_rate        DECIMAL(5,4) DEFAULT 0,
    tax_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total           DECIMAL(10,2) NOT NULL,
    metadata        JSONB DEFAULT '{}',           -- e.g. POS item ID, recipe ID
    posted_by       UUID,                         -- staff user ID
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided          BOOLEAN DEFAULT FALSE,
    voided_at       TIMESTAMPTZ,
    voided_by       UUID
);

CREATE INDEX idx_line_items_folio ON folio_line_items(folio_id);
CREATE INDEX idx_line_items_source ON folio_line_items(source_module);
```

#### 4.2.4 Financial Ledger & Payments

```sql
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio_id        UUID NOT NULL REFERENCES folios(id),
    property_id     UUID NOT NULL REFERENCES properties(id),
    amount          DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    method          VARCHAR(50) NOT NULL,         -- 'credit_card', 'debit', 'cash', 'apple_pay', 'google_pay', 'bank_transfer'
    status          VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'authorized', 'captured', 'refunded', 'failed'
    stripe_payment_id VARCHAR(255),
    stripe_charge_id  VARCHAR(255),
    last_four       VARCHAR(4),
    card_brand      VARCHAR(20),
    pre_auth        BOOLEAN DEFAULT FALSE,
    captured_at     TIMESTAMPTZ,
    refunded_amount DECIMAL(12,2) DEFAULT 0,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    property_id     UUID NOT NULL REFERENCES properties(id),
    user_id         UUID,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_property_date ON audit_log(property_id, created_at);
```

#### 4.2.5 Revenue Management & Inventory

```sql
CREATE TABLE rate_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    name            VARCHAR(200) NOT NULL,
    room_type       room_type NOT NULL,
    base_rate       DECIMAL(10,2) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    includes_breakfast BOOLEAN DEFAULT FALSE,
    cancellation_policy VARCHAR(50),              -- 'flexible', 'moderate', 'strict', 'non_refundable'
    min_stay        SMALLINT DEFAULT 1,
    max_stay        SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    rate_plan_id    UUID NOT NULL REFERENCES rate_plans(id),
    date            DATE NOT NULL,
    rate            DECIMAL(10,2) NOT NULL,
    available_rooms SMALLINT NOT NULL,
    occupancy_pct   DECIMAL(5,2),                 -- snapshot at time of pricing
    demand_factor   DECIMAL(4,3) DEFAULT 1.000,   -- multiplier from pricing engine
    is_closed       BOOLEAN DEFAULT FALSE,         -- stop sell
    source          VARCHAR(50) NOT NULL DEFAULT 'system', -- 'system', 'manual', 'override'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rate_plan_id, date)
);

CREATE INDEX idx_daily_rates_property_date ON daily_rates(property_id, date);

CREATE TABLE channel_inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    room_type       room_type NOT NULL,
    channel         VARCHAR(50) NOT NULL,         -- 'direct', 'booking.com', 'expedia', 'airbnb'
    date            DATE NOT NULL,
    available       SMALLINT NOT NULL,
    rate            DECIMAL(10,2),
    closed          BOOLEAN DEFAULT FALSE,
    last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status     VARCHAR(20) DEFAULT 'synced', -- 'synced', 'pending', 'error'
    UNIQUE (property_id, room_type, channel, date)
);

CREATE INDEX idx_channel_inv_sync ON channel_inventory(sync_status) WHERE sync_status != 'synced';
```

#### 4.2.6 Housekeeping & Work Orders

```sql
CREATE TYPE room_status_change_source AS ENUM (
    'housekeeping', 'front_desk', 'maintenance', 'system'
);

CREATE TABLE room_status_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID NOT NULL REFERENCES rooms(id),
    previous_status room_status,
    new_status      room_status NOT NULL,
    changed_by      UUID,
    source          room_status_change_source NOT NULL DEFAULT 'housekeeping',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_room_status_log_room ON room_status_log(room_id, created_at DESC);

CREATE TYPE work_order_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE work_order_status AS ENUM ('pending', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled');
CREATE TYPE work_order_category AS ENUM ('maintenance', 'housekeeping', 'guest_request', 'inspection', 'emergency');

CREATE TABLE work_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    room_id         UUID REFERENCES rooms(id),
    category        work_order_category NOT NULL,
    priority        work_order_priority NOT NULL DEFAULT 'medium',
    status          work_order_status NOT NULL DEFAULT 'pending',
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    assigned_to     UUID,
    created_by      UUID NOT NULL,
    sla_deadline    TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    resolution_notes TEXT,
    attachments     TEXT[] DEFAULT '{}',           -- S3 URLs
    is_recurring    BOOLEAN DEFAULT FALSE,
    recurrence_rule VARCHAR(100),                  -- iCal RRULE format
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_orders_property_status ON work_orders(property_id, status);
CREATE INDEX idx_work_orders_assigned ON work_orders(assigned_to) WHERE assigned_to IS NOT NULL;
```

#### 4.2.7 POS & Orders

```sql
CREATE TYPE order_status AS ENUM (
    'placed', 'confirmed', 'preparing', 'ready',
    'delivered', 'completed', 'cancelled'
);

CREATE TYPE order_channel AS ENUM (
    'qr_in_room', 'pos_terminal', 'web_guest', 'phone', 'staff'
);

CREATE TABLE pos_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    folio_id        UUID REFERENCES folios(id),  -- NULL if pay-now order
    guest_id        UUID REFERENCES guests(id),
    room_id         UUID REFERENCES rooms(id),
    channel         order_channel NOT NULL,
    status          order_status NOT NULL DEFAULT 'placed',
    subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total           DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method  VARCHAR(50),                  -- 'room_charge', 'card', 'apple_pay', 'google_pay'
    payment_status  VARCHAR(30) DEFAULT 'pending',
    stripe_payment_id VARCHAR(255),
    notes           TEXT,
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE TABLE pos_order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES pos_orders(id),
    menu_item_id    UUID NOT NULL,
    quantity        SMALLINT NOT NULL DEFAULT 1,
    unit_price      DECIMAL(10,2) NOT NULL,
    modifiers       JSONB DEFAULT '[]',           -- [{"name": "no onions", "price": 0}]
    special_requests TEXT,
    status          VARCHAR(30) DEFAULT 'pending'
);

CREATE TABLE menu_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    category        VARCHAR(100) NOT NULL,         -- 'appetizer', 'main', 'dessert', 'beverage', 'amenity'
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    price           DECIMAL(10,2) NOT NULL,
    tax_rate        DECIMAL(5,4) DEFAULT 0,
    image_url       TEXT,
    is_available    BOOLEAN DEFAULT TRUE,
    preparation_time SMALLINT,                     -- minutes
    allergens       TEXT[] DEFAULT '{}',
    sort_order      SMALLINT DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.2.8 Messaging & Communications

```sql
CREATE TYPE message_channel AS ENUM ('sms', 'whatsapp', 'web_chat', 'email', 'in_app');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_sender_type AS ENUM ('guest', 'staff', 'ai_agent', 'system');

CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    guest_id        UUID REFERENCES guests(id),
    reservation_id  UUID REFERENCES reservations(id),
    channel         message_channel NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'open', -- 'open', 'assigned', 'resolved', 'archived'
    assigned_to     UUID,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_type     message_sender_type NOT NULL,
    sender_id       UUID,
    direction       message_direction NOT NULL,
    content         TEXT NOT NULL,
    content_type    VARCHAR(30) DEFAULT 'text',    -- 'text', 'image', 'file', 'location'
    media_url       TEXT,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_property ON conversations(property_id, status);
```

#### 4.2.9 Staff & RBAC

```sql
CREATE TYPE staff_role AS ENUM (
    'owner', 'general_manager', 'front_desk', 'housekeeping_supervisor',
    'housekeeper', 'maintenance', 'food_beverage', 'pos_staff', 'readonly'
);

CREATE TABLE staff_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(30),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    role            staff_role NOT NULL,
    pin_hash        VARCHAR(255),                  -- for tablet quick-login
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_id, email)
);

CREATE TABLE staff_shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_user_id   UUID NOT NULL REFERENCES staff_users(id),
    property_id     UUID NOT NULL REFERENCES properties(id),
    shift_date      DATE NOT NULL,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    role_override   staff_role,
    status          VARCHAR(30) DEFAULT 'scheduled', -- 'scheduled', 'checked_in', 'checked_out', 'absent'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_date ON staff_shifts(property_id, shift_date);
```

### 4.3 Redis Data Structures

```
# Room availability cache (hot path — room search)
room:availability:{property_id}:{date}         → Sorted Set of room_type → available count
room:status:{property_id}                      → Hash { room_number → status }

# Real-time occupancy
property:occupancy:{property_id}               → Hash { total, occupied, ooo }

# Active sessions (staff)
session:{session_id}                           → Hash { user_id, property_id, role, ip }

# Guest presence (for real-time operations)
property:active_guests:{property_id}           → Set of guest_id currently checked in

# Rate limiting
ratelimit:{endpoint}:{identifier}              → String (counter with TTL)

# Event queue (Redis Streams)
stream:domain_events                           → Stream (append-only event log)

# Pre-auth payments awaiting capture
payment:preauth:{property_id}                  → Set of payment_id
```

---

## 5. Module Specifications

### A. Core Property Management & Front Desk (PMS)

#### A.1 Interactive Tape Chart

The tape chart is the **primary operational interface** for front-desk staff. It must render in under 200ms for a 200-room property.

**Functional Requirements:**

| Feature            | Description                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Grid Layout        | Rows = rooms, columns = dates. Configurable date range (7-day, 14-day, 30-day view)            |
| Color Coding       | Reserved (blue), checked-in (green), departed (gray), OOO (red), dirty (yellow), clean (white) |
| Drag & Drop        | Drag reservations between rooms to reassign; validates room type compatibility                 |
| Inline Editing     | Click reservation to edit dates, guest info, rate — no page navigation                         |
| Filters            | By room type, floor, status, rate plan, source                                                 |
| Conflict Detection | Prevents overlapping reservations with atomic room-assignment lock                             |
| Bulk Operations    | Multi-select for batch checkout, batch status change                                           |
| Touch Optimized    | All interactions work with finger gestures on iPad/Android tablet                              |

**Tape Chart Rendering Logic:**

```
For each room (row):
  For each date (column):
    1. Query room_status_log for current status
    2. Query reservations for overlapping booking
    3. Render cell with:
       - Background color (status mapping)
       - Guest name (if occupied)
       - Rate (if reserved)
       - Marker flags (VIP, early arrival, late checkout)
    4. Cell click → open reservation detail slide-over
    5. Drag start → capture reservation_id, validate move
    6. Drag end → atomic UPDATE room_id WHERE no conflict
```

**Data Flow:**

```
Frontend (WebSocket) ←── room_status:updated event
     │
     ├── Re-render affected row
     ├── Update room count badges
     └── Trigger toast notification if action by another user
```

#### A.2 Automated Room Assignment Engine

```typescript
interface AssignmentCriteria {
  guestPreferences: {
    floor?: number;
    bedType?: string;
    quiet?: boolean;
    accessible?: boolean;
    nearElevator?: boolean;
  };
  roomConstraints: {
    requiredType: RoomType;
    maxOccupancy: number;
    requiredAmenities: string[];
  };
  operationalState: {
    currentStatus: RoomStatus;
    lastCleanedAt?: Date;
    nextMaintenanceWindow?: Date;
  };
}

interface AssignmentResult {
  roomId: UUID;
  score: number; // 0-100 confidence score
  reasons: string[]; // explainability
}

// Assignment Algorithm (simplified):
function assignRoom(criteria: AssignmentCriteria): AssignmentResult {
  const candidates = rooms.filter(
    (r) =>
      (r.type === criteria.roomConstraints.requiredType && r.status === 'vacant_clean') ||
      (r.status === 'vacant_inspected' && r.maxOccupancy >= criteria.roomConstraints.maxOccupancy),
  );

  const scored = candidates.map((room) => {
    let score = 50; // base
    if (room.floor === criteria.guestPreferences.floor) score += 15;
    if (room.bedConfig === criteria.roomConstraints.bedType) score += 10;
    if (!criteria.guestPreferences.quiet || room.floor >= 3) score += 5;
    // ... additional scoring factors
    // Prefer rooms cleaned most recently (freshness)
    score += freshnessBonus(room.lastCleanedAt);
    return { room, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0];
}
```

#### A.3 Housekeeping Module

**Room Status State Machine:**

```
                    ┌───────────────────┐
          checkout  │                   │  check-in
     ┌──────────────│  OCCUPIED_DIRTY   │──────────────┐
     │              │                   │              │
     │              └─────────┬─────────┘              │
     │                        │                        │
     │                        │ housekeeper cleans     │
     │                        ▼                        │
     │              ┌───────────────────┐              │
     │              │  OCCUPIED_CLEAN   │              │
     │              └─────────┬─────────┘              │
     │                        │ supervisor inspects    │
     ▼                        ▼                        │
┌─────────────────┐  ┌───────────────────┐             │
│ VACANT_DIRTY    │  │  VACANT_INSPECTED │             │
└────────┬────────┘  └─────────┬─────────┘             │
         │                     │                       │
         │ housekeeper cleans  │ room ready            │
         ▼                     ▼                       │
┌─────────────────┐  ┌───────────────────┐             │
│ VACANT_CLEAN    │  │   (Ready for      │◄────────────┘
└────────┬────────┘  │    Assignment)    │
         │            └───────────────────┘
         │ supervisor inspects
         ▼
┌─────────────────┐
│VACANT_INSPECTED │
└─────────────────┘

    OOO/OOS are terminal states from any state
    (requires maintenance work order to resolve)
```

**Mobile Housekeeping Interface:**

- **View:** Today's room list grouped by floor
- **Actions:** Swipe right = mark clean, Swipe left = flag issue (creates work order)
- **Checklist:** Per-room configurable checklist (towels, minibar, linens, bathroom)
- **Photo Capture:** Before/after photos for dispute resolution
- **Batch Mode:** Mark entire floor clean with one tap
- **SLA Dashboard:** Overdue rooms highlighted, average time per room tracked

#### A.4 Continuous Financial Ledger

**Traditional Night Audit vs. Hotelia Continuous Audit:**

| Aspect             | Traditional                       | Hotelia                                                 |
| ------------------ | --------------------------------- | ------------------------------------------------------- |
| Audit window       | 2:00 AM – 4:00 AM (system locked) | Always open; no downtime                                |
| Transaction cutoff | Batch at midnight                 | Each transaction timestamped with microsecond precision |
| Reconciliation     | Manual spreadsheet                | Real-time running balance with anomaly detection        |
| Reporting          | Post-audit batch                  | On-demand, point-in-time snapshots                      |
| Error detection    | Next morning                      | Instant alerts on balance mismatches                    |

**Continuous Audit Engine:**

```
Every folio_line_item INSERT triggers:
  1. UPDATE folios.balance += item.total
  2. INSERT INTO audit_log (action, entity, old, new)
  3. EMIT event: folio.balance_updated

Scheduled (every 15 min):
  1. Reconcile: SUM(folio_line_items) WHERE folio_id = X
  2. Compare with folios.balance
  3. If delta > $0.01: EMIT event: anomaly.folio_mismatch
  4. Auto-create work order for accounting review
```

**Multi-Folio Splitting:**

- Group folio (master with room charge)
- Individual folios per guest (split billing)
- Company folio (corporate direct billing)
- Travel agent folio (commission tracking)

**Tax Engine:**

```sql
CREATE TABLE tax_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    name            VARCHAR(100) NOT NULL,         -- 'VAT 10%', 'City Tax', 'Service Charge'
    rate            DECIMAL(5,4) NOT NULL,
    applies_to      line_item_source[] NOT NULL,   -- which POS categories
    is_compound     BOOLEAN DEFAULT FALSE,         -- compound on top of other taxes
    is_percentage   BOOLEAN DEFAULT TRUE,
    flat_amount     DECIMAL(10,2),
    min_amount      DECIMAL(10,2),                 -- minimum taxable amount
    max_amount      DECIMAL(10,2),                 -- cap
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### B. Revenue Management & Channel Distribution (RMS / CRS)

#### B.1 Dynamic Pricing Algorithm

**Input Factors:**

| Factor                                            | Weight | Data Source                         |
| ------------------------------------------------- | ------ | ----------------------------------- |
| Current occupancy %                               | 30%    | Real-time from reservations         |
| Pace (booking velocity vs. same period last year) | 20%    | Historical + real-time              |
| Day of week                                       | 15%    | Calendar                            |
| Seasonality / event calendar                      | 15%    | Manual events + public holidays API |
| Competitive rates                                 | 10%    | Optional OTA scraping               |
| Days until arrival                                | 10%    | Reservation metadata                |

**Pricing Formula (simplified):**

```
optimized_rate = base_rate × occupancy_factor × demand_factor × dow_factor × season_factor × advance_factor

Where:
  occupancy_factor:
    if occ < 40%  → 0.85 (discount to drive demand)
    if occ < 60%  → 0.95
    if occ < 75%  → 1.00 (base rate)
    if occ < 85%  → 1.10
    if occ < 95%  → 1.25
    if occ >= 95% → 1.40 (premium scarcity)

  demand_factor:
    if pace > 1.2x last year → 1.15
    if pace > 1.0x last year → 1.05
    if pace < 0.8x last year → 0.90
    else → 1.00

  dow_factor:
    Mon-Thu: 0.95  |  Fri-Sat: 1.15  |  Sun: 1.00

  season_factor:
    peak: 1.20  |  shoulder: 1.00  |  low: 0.85

  advance_factor:
    1-3 days: 1.10  |  4-7 days: 1.05  |  8-14: 1.00  |  15-30: 0.95  |  30+: 0.90
```

**Rate Floor & Ceiling:**

```sql
ALTER TABLE daily_rates ADD COLUMN min_rate DECIMAL(10,2);
ALTER TABLE daily_rates ADD COLUMN max_rate DECIMAL(10,2);
-- Pricing engine never violates floor/ceiling
```

#### B.2 Channel Manager Engine

**Architecture:**

```
┌─────────────────────────────────────────────┐
│            Channel Manager Engine           │
│                                             │
│  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Rate Sync   │  │ Inventory Sync      │  │
│  │ Dispatcher  │  │ Dispatcher          │  │
│  └──────┬──────┘  └──────┬──────────────┘  │
│         │                │                  │
│  ┌──────┴────────────────┴──────────────┐  │
│  │         OTAs Adapter Layer           │  │
│  │                                      │  │
│  │  ┌────────────┐ ┌────────────────┐   │  │
│  │  │ Booking.com│ │ Expedia        │   │  │
│  │  │ (XML/HTTPS)│ │ (Switch)       │   │  │
│  │  └────────────┘ └────────────────┘   │  │
│  │  ┌────────────┐ ┌────────────────┐   │  │
│  │  │ Airbnb     │ │ Hotels.com     │   │  │
│  │  │ (iCal+API) │ │ (via Expedia)  │   │  │
│  │  └────────────┘ └────────────────┘   │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │     Booking Receipts Processor       │  │
│  │  - Parse OTA booking webhook         │  │
│  │  - Create reservation in PMS         │  │
│  │  - Map to guest profile (CRM merge)  │  │
│  │  - Confirm back to OTA               │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

Sync triggers:
  1. daily_rates changed → push rates to all connected channels
  2. room inventory changed → push availability to all channels
  3. reservation received from OTA → create in PMS → update inventory
  4. reservation modified in PMS → push update to originating channel
  5. Every 5 min: heartbeat sync to verify consistency
```

**Two-Way Sync Conflict Resolution:**

```
Conflict scenario: Guest modifies booking on Booking.com AND front desk modifies same booking simultaneously

Resolution:
  1. Last-write-wins at the field level (not whole-record)
  2. Conflict log created with both versions
  3. Staff notified: "Booking.com modified reservation — review required"
  4. 15-minute grace period for manual resolution
  5. If unresolved, most recent source timestamp wins
```

#### B.3 Direct Booking Engine

**Commission-Free Booking Widget:**

```
Embeddable on hotel website via:
  <script src="https://cdn.hotelia.com/widget.js" data-property="hotel-slug"></script>

Features:
  - Real-time availability search
  - Rate display with upsell (room upgrade, breakfast add-on)
  - Guest details form
  - Payment capture (Stripe Elements — PCI-compliant iframe)
  - Confirmation email/SMS
  - Integration with hotel's own Google Analytics / Meta Pixel

Revenue impact:
  - Average OTA commission: 15-25%
  - Hotelia direct booking commission: 0%
  - Projected savings per 100 bookings/month: $1,500-$2,500
```

---

### C. Unified Point of Sale (POS) & In-Room Digital Services

#### C.1 QR-Code Guest Ordering System

**Guest Journey:**

```
1. Guest arrives in room
2. Sees QR code card on nightstand / table tent
3. Scans QR code with phone camera
4. Opens PWA: hotelia.com/g/{property-slug}/room/{room-number}
   (No app download required)
5. Browses menu, adds items to cart
6. Chooses payment:
   a. "Charge to Room" → posted to folio line item
   b. "Pay Now" → Stripe checkout (Apple Pay / Google Pay / Card)
7. Order appears on Kitchen Display System
8. Delivery staff delivers → marks delivered in system
9. Guest rates experience (optional)
```

**QR Code Generation:**

```
Each room gets a unique, persistent QR code:
  URL: https://hotelia.com/g/{property-slug}/room/{room-number}
  QR: Generated server-side, printed on durable card
  Deep link: PWA checks in via service worker, shows native-like UI

Security:
  - Room number in URL is not sensitive (publicly displayed in room)
  - No authentication required for browsing
  - Session tokens issued after first interaction
  - Rate limiting per IP to prevent abuse
```

#### C.2 Order Processing Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Guest PWA   │────▶│  Order API   │────▶│  Order DB    │
│  (QR scan)   │     │  (validate)  │     │  (pending)   │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │              │
              ┌──────▼──────┐ ┌─────▼────────┐
              │ KDS Display │ │ Folio Posting │
              │ (kitchen)   │ │ (if room charge)│
              └──────┬──────┘ └──────────────┘
                     │
              ┌──────▼──────┐
              │  Prep Complete│
              │  → notify guest│
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │  Delivery    │
              │  → mark complete│
              └─────────────┘
```

**Kitchen Display System (KDS):**

- Web-based, runs on tablet mounted in kitchen
- Orders grouped by type (dine-in, room service, takeaway)
- Priority highlighting (VIP rooms, overdue orders)
- Bump bar / touch to advance order status
- Allergen warnings displayed prominently
- Prep time tracking and analytics

#### C.3 Physical POS Terminal

For hotel restaurants, bars, and front-desk retail:

- React-based tablet interface (iPad / Android tablet)
- Table management with floor plan editor
- Split bill, combine tables, transfer items
- Cash drawer integration (USB/Bluetooth)
- Receipt printer integration (ESC/POS thermal printers)
- End-of-day Z-report generation
- Staff login via PIN (fast shift start)

---

### D. Guest Experience, Contactless & Messaging Suite

#### D.1 Contactless Check-In Flow

```
PRE-ARRIVAL (24-48 hours before):
  1. Automated email/SMS: "Complete your check-in"
  2. Guest opens PWA link
  3. Upload government ID (photo) → stored encrypted in S3
  4. Upload selfie for identity verification (optional, liveness check)
  5. Re-enter credit card for pre-authorization
  6. Digital signature on terms & conditions
  7. Select preferences (floor, pillow type, minibar stocking)
  8. Receive digital room key (if smart lock integrated)

ARRIVAL:
  Option A: Bypass front desk → go directly to room → door unlocks via phone
  Option B: Quick desk pickup → "Welcome, {name}" → hand over physical key
  Option C: Kiosk check-in → self-service tablet at lobby

CHECK-IN COMPLETION:
  - Status: reservation.checked_in
  - Room status: occupied_dirty → (housekeeping notified)
  - Welcome message sent automatically
  - Digital folio activated
```

#### D.2 Digital Door Lock Integration

**Supported Protocols:**

| Vendor                | Protocol   | Integration Method                           |
| --------------------- | ---------- | -------------------------------------------- |
| ASSA ABLOY (VingCard) | BLE + NFC  | Mobile Access SDK (OEM partnership required) |
| SALTO                 | BLE + RFID | SALTO Systems API (ProAccess)                |
| Dormakaba             | BLE + NFC  | ambiance API                                 |
| Igloohome             | WiFi + PIN | Igloohome Cloud API                          |
| generic (MiFare)      | RFID       | Property-specific encoder hardware           |

**Web-NFC Wallet Key (Android):**

```
1. Guest checks in → receives "Add to Wallet" link
2. Taps link on Android with NFC
3. Android prompts: "Add pass to Google Wallet?"
4. Guest taps phone to door lock → BLE/NFC unlock
5. No app download required (Google Wallet handles it)

Note: iOS NFC wallet keys require native app (Apple Wallet integration is restricted)
Fallback for iOS: QR code displayed in PWA → scan at door → BLE unlock
```

#### D.3 Unified Messaging Hub

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                Unified Messaging Hub                    │
│                                                         │
│  INBOUND CHANNELS:          OUTBOUND CHANNELS:         │
│  ┌──────────┐               ┌──────────┐               │
│  │ WhatsApp │               │ WhatsApp │               │
│  │ (Cloud   │               │ (Cloud   │               │
│  │  API)    │               │  API)    │               │
│  └────┬─────┘               └────┬─────┘               │
│  ┌────┴─────┐               ┌────┴─────┐               │
│  │ SMS      │               │ SMS      │               │
│  │(Twilio)  │               │(Twilio)  │               │
│  └────┬─────┘               └────┬─────┘               │
│  ┌────┴─────┐               ┌────┴─────┐               │
│  │ Web Chat │               │ Web Chat │               │
│  │ (Widget) │               │ (Widget) │               │
│  └────┬─────┘               └────┬─────┘               │
│  ┌────┴─────┐               ┌────┴─────┐               │
│  │ Email    │               │ Email    │               │
│  │(SendGrid)│               │(SendGrid)│               │
│  └────┬─────┘               └────┬─────┘               │
│       │                          │                      │
│       ▼                          ▼                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Conversation Router                   │   │
│  │  - Deduplicates contacts across channels        │   │
│  │  - Routes to assigned staff or AI agent          │   │
│  │  - Enriches with guest profile context          │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                                │
│  ┌─────────────────────┼───────────────────────────┐   │
│  │              Staff Inbox (Web UI)                │   │
│  │  - Threaded conversation view                   │   │
│  │  - Guest context sidebar (profile, stay, folio)│   │
│  │  - Quick replies / templates                    │   │
│  │  - Internal notes (staff-only)                  │   │
│  │  - AI suggestion chips                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │          AI Response Agent                       │   │
│  │  - Handles common queries (WiFi, hours, amenities)│  │
│  │  - Escalates to human when confidence < threshold│   │
│  │  - Learns from resolved conversations           │   │
│  │  - Auto-translates if guest language detected    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**AI Agent Capabilities:**

| Query Type                  | AI Response                                         | Confidence Threshold |
| --------------------------- | --------------------------------------------------- | -------------------- |
| "What's the WiFi password?" | Auto-respond with property WiFi info                | 95%                  |
| "Can I get extra towels?"   | Creates housekeeping work order + confirms to guest | 90%                  |
| "What time is breakfast?"   | Auto-respond with F&B hours                         | 95%                  |
| "I need to check out late"  | Shows late checkout options + rates, or escalates   | 70%                  |
| Complex billing dispute     | Always escalate to human                            | N/A                  |

#### D.4 Unified Guest Profile (CRM)

```typescript
interface GuestProfile {
  // Identity
  id: UUID;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  nationality?: string;

  // Cross-stay aggregation
  totalStays: number;
  totalNights: number;
  lifetimeSpend: number;
  averageRating: number; // guest's own satisfaction ratings given
  lastStayDate?: Date;
  lastRoomType?: RoomType;

  // Preferences (inferred + explicit)
  preferences: {
    bedType?: string;
    floor?: number;
    pillowType?: string;
    roomTemperature?: string;
    minibarPreferences?: string[];
    dietaryRestrictions?: string[];
    preferredLanguage?: string;
    accessibilityNeeds?: string[];
  };

  // Behavioral tags (auto-generated)
  tags: string[]; // 'frequent', 'vip', 'high_spend', 'late_checkout_prone', 'dietary_restricted'

  // Stay history
  stays: GuestStay[];

  // Communication history
  recentConversations: Conversation[];

  // Notes (staff-entered)
  notes: StaffNote[];
}
```

---

### E. Workforce, Maintenance & Task Management

#### E.1 Preventive Maintenance Scheduling

```sql
CREATE TABLE maintenance_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     UUID NOT NULL REFERENCES properties(id),
    asset_type      VARCHAR(100) NOT NULL,         -- 'hvac', 'plumbing', 'electrical', 'furniture', 'lock', 'fire_safety'
    asset_location  VARCHAR(200),                  -- room number or common area
    frequency       VARCHAR(50) NOT NULL,          -- 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'
    last_completed  TIMESTAMPTZ,
    next_due        TIMESTAMPTZ NOT NULL,
    assigned_role   staff_role,
    template        JSONB NOT NULL,                 -- checklist items for this maintenance type
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Maintenance Scheduler Job:**

```
Runs every hour:
  1. SELECT * FROM maintenance_schedules WHERE next_due <= NOW() AND is_active = TRUE
  2. For each due schedule:
     a. Create work_order with category='maintenance', priority='medium'
     b. Assign to staff based on role match + current workload
     c. Update next_due based on frequency
     d. EMIT event: maintenance.scheduled_created
  3. Alert supervisor if no staff available for urgent maintenance
```

#### E.2 Emergency Work Order Dispatch

```
EMERGENCY DETECTED (guest report or sensor alert):
  1. Work order created with priority='urgent'
  2. Immediate push notification to:
     - Nearest available maintenance staff (GPS-based if available)
     - Front desk manager
     - Duty manager (after-hours)
  3. SLA timer starts:
     - Emergency: 15 minutes acknowledgment, 60 minutes resolution
     - High: 30 minutes acknowledgment, 4 hours resolution
     - Medium: 2 hours acknowledgment, 24 hours resolution
     - Low: 8 hours acknowledgment, 72 hours resolution
  4. Escalation chain:
     - T+50% of SLA: notify supervisor
     - T+80% of SLA: notify manager
     - T+100% of SLA: notify GM + flag in dashboard
  5. Resolution → guest notified automatically
  6. Guest satisfaction survey triggered
```

#### E.3 Dynamic Labor Roster Forecasting

```
FORECASTING INPUTS:
  - Reservations for next 14 days (occupancy curve)
  - Historical staffing ratios per occupancy level
  - Day-of-week patterns
  - Special events / local holidays
  - Known group bookings

STAFFING RULES (configurable per property):
  Front desk:  1 staff per 30 occupied rooms (min 1)
  Housekeeping: 1 staff per 12 rooms (min 2)
  Maintenance:  1 staff per 50 occupied rooms (min 1)
  F&B:          1 staff per 20 covers (restaurant capacity)

OUTPUT:
  - Recommended staffing levels per shift per day
  - Shift slots auto-created for managers to review/approve
  - Gap alerts: "Wednesday night shift is understaffed by 1"
  - Overtime cost estimation
```

---

## 6. Technical Stack & Infrastructure

### 6.1 Technology Selection Matrix

| Layer                    | Technology                                     | Rationale                                                                  |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------- |
| **Frontend (Staff)**     | Next.js 15 (App Router) + React 19             | SSR for tape chart performance; RSC for data-heavy views; mature ecosystem |
| **Frontend (Guest PWA)** | Next.js 15 + PWA manifest + Workbox            | Same framework, different deployment; offline caching via service worker   |
| **UI Component Library** | Radix UI + Tailwind CSS                        | Accessible, unstyled primitives; rapid styling                             |
| **State Management**     | TanStack Query (server) + Zustand (client)     | Server cache + minimal client state                                        |
| **Real-time**            | Socket.IO (WebSocket)                          | Room status updates, messaging, KDS live sync                              |
| **Backend Runtime**      | Node.js 22 LTS + TypeScript 5.x                | Full-stack TS; excellent async I/O for real-time                           |
| **API Layer**            | tRPC (internal) + REST (external/integrations) | Type-safe internal APIs; standards-compliant external                      |
| **Primary Database**     | PostgreSQL 16                                  | JSONB for flexible config; pgvector for AI embeddings; proven reliability  |
| **Time-Series**          | TimescaleDB (PostgreSQL extension)             | Continuous aggregates for revenue analytics                                |
| **Cache / Events**       | Redis 7 (Streams + Pub/Sub)                    | Session store, rate limiting, event bus, real-time pub/sub                 |
| **Object Storage**       | Cloudflare R2 (or AWS S3)                      | ID documents, receipts, photos; zero egress fees on R2                     |
| **Payment Processing**   | Stripe (Connect for multi-property)            | PCI-DSS Level 1 compliant; supports Apple Pay, Google Pay                  |
| **SMS / WhatsApp**       | Twilio (SMS) + Meta Cloud API (WhatsApp)       | Reliable delivery; WhatsApp business verification                          |
| **Email**                | Resend (transactional)                         | Modern API; good deliverability; reasonable cost                           |
| **Search**               | PostgreSQL FTS (pg_trgm + tsvector)            | Sufficient for guest search; no extra infrastructure                       |
| **AI / LLM**             | OpenAI API (GPT-4o)                            | Guest messaging AI agent, smart suggestions                                |
| **Container Runtime**    | Docker + Docker Compose (dev)                  | Reproducible dev environment; simple prod deployment                       |
| **Hosting**              | Railway or Render (MVP) → AWS ECS (scale)      | Fast deployment; predictable costs; easy scaling path                      |
| **CI/CD**                | GitHub Actions                                 | Tight integration; free for public repos; matrix builds                    |
| **Monitoring**           | Grafana + Prometheus + Loki                    | Stack traces, metrics, logs; open-source; self-hostable                    |
| **Error Tracking**       | Sentry                                         | Real-time error monitoring with source maps                                |

### 6.2 Monorepo Structure

```
hotelia/
├── apps/
│   ├── web/                    # Staff dashboard (Next.js)
│   │   ├── app/
│   │   │   ├── (auth)/         # Login, register
│   │   │   ├── (dashboard)/    # Main authenticated app
│   │   │   │   ├── pms/        # Tape chart, reservations
│   │   │   │   ├── housekeeping/
│   │   │   │   ├── pos/
│   │   │   │   ├── messaging/
│   │   │   │   ├── work-orders/
│   │   │   │   ├── revenue/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   └── api/            # tRPC handlers
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   │
│   ├── guest/                  # Guest PWA (Next.js)
│   │   ├── app/
│   │   │   ├── g/[property]/   # QR landing
│   │   │   │   ├── room/[roomNumber]/
│   │   │   │   ├── checkin/
│   │   │   │   └── chat/
│   │   │   └── api/
│   │   └── components/
│   │
│   ├── kds/                    # Kitchen Display System (Next.js)
│   │   └── app/
│   │
│   └── pos-terminal/           # Physical POS (React + Electron or PWA)
│       └── src/
│
├── packages/
│   ├── database/               # Prisma schema, migrations, seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── client.ts
│   │       └── types/
│   │
│   ├── shared/                 # Shared types, utils, constants
│   │   ├── types/
│   │   ├── validators/         # Zod schemas
│   │   ├── constants/
│   │   └── utils/
│   │
│   ├── events/                 # Domain event definitions & handlers
│   │   ├── definitions/
│   │   ├── handlers/
│   │   └── emitter/
│   │
│   ├── channels/               # OTA channel adapters
│   │   ├── booking-com/
│   │   ├── expedia/
│   │   ├── airbnb/
│   │   └── direct/
│   │
│   └── integrations/           # External hardware integrations
│       ├── stripe/
│       ├── twilio/
│       ├── smart-locks/
│       └── pabx/
│
├── infra/
│   ├── docker/
│   │   ├── Dockerfile
│   │   └── docker-compose.yml
│   ├── github-actions/
│   └── terraform/              # IaC for production
│
├── docs/
│   ├── ARCHITECTURE.md         # This document
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
│
├── turbo.json                  # Turborepo config
├── package.json
├── .env.example
└── README.md
```

### 6.3 Database Strategy

**PostgreSQL (Primary OLTP):**

- All transactional data (reservations, folios, payments, orders)
- JSONB columns for flexible metadata (config, preferences, channel data)
- Row-Level Security (RLS) policies for multi-tenancy

```sql
-- Multi-tenancy via RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_isolation ON reservations
  USING (property_id = current_setting('app.current_property_id')::UUID);

-- Applied via connection:
SET app.current_property_id = '{property-uuid}';
-- Every query automatically filters to current property
```

**Redis (Cache + Events):**

```
Cache strategy:
  - Room availability: Cache-aside with 30-second TTL
  - Rate plans: Cache-aside with 5-minute TTL
  - Guest profile (basic): Cache-aside with 2-minute TTL
  - Session tokens: Write-through (always in Redis)
  - Active staff presence: Real-time via Redis Pub/Sub

Event stream:
  - Domain events published to Redis Streams
  - Consumers read from各自 consumer group
  - Retention: 7 days (configurable)
  - Dead letter queue for failed processing
```

**TimescaleDB (Analytics):**

```sql
-- Convert key tables to hypertables for time-series queries
SELECT create_hypertable('folio_line_items', 'posted_at');
SELECT create_hypertable('room_status_log', 'created_at');
SELECT create_hypertable('daily_rates', 'date');

-- Continuous aggregate: Daily revenue by property
CREATE MATERIALIZED VIEW daily_revenue
WITH (timescaledb.continuous) AS
SELECT
    property_id,
    DATE(posted_at) as date,
    source_module,
    SUM(total) as revenue,
    COUNT(*) as transaction_count
FROM folio_line_items
WHERE NOT voided
GROUP BY property_id, DATE(posted_at), source_module;
```

---

## 7. Security, Compliance & Hardware Integration

### 7.1 PCI-DSS Compliance Strategy

**Scope Reduction via Stripe:**

| PCI Requirement         | Hotelia Approach                                                           |
| ----------------------- | -------------------------------------------------------------------------- |
| Card data storage       | **NEVER stored.** Stripe tokenizes at client side (Stripe Elements iframe) |
| Transmission encryption | TLS 1.3 enforced on all connections                                        |
| Access control          | Stripe handles all cardholder data environment (CDE)                       |
| Audit logging           | All payment events logged in `payments` table + Stripe dashboard           |
| Quarterly scan          | Not required (no card data touches Hotelia servers)                        |

**Result: PCI-DSS SAQ A compliance (lowest level)**

**Additional PCI Controls:**

```
- Stripe.js loaded from Stripe's CDN (PCI audit boundary)
- Hotelia never sees raw card numbers (only last 4 + brand)
- Pre-authorizations handled via Stripe PaymentIntents API
- Refunds processed server-side via Stripe SDK
- 3D Secure automatically enforced for European cards (SCA/PSD2)
```

### 7.2 GDPR Compliance

```
DATA PROTECTION MEASURES:
  1. PII Encryption: Guest personal data encrypted at rest (AES-256 via PostgreSQL pgcrypto)
  2. Consent Tracking: consent_pii field on guest record with timestamp
  3. Right to Access: API endpoint to export all guest data (JSON format)
  4. Right to Erasure: Soft-delete with 30-day purge; anonymize historical folios
  5. Data Minimization: Only collect what's operationally necessary
  6. Retention Policy: Guest profiles retained 7 years (accounting); PII purge configurable
  7. Cross-border: Data residency per property region (EU → EU hosting)
  8. Data Processing Agreements: Required for all sub-processors (Stripe, Twilio, etc.)

IMPLEMENTATION:
  - Guest data API: /api/guest/{id}/export (GDPR Article 15)
  - Guest data deletion: /api/guest/{id}/delete (GDPR Article 17)
  - Consent audit trail in audit_log table
  - Automated data retention job (monthly, deletes expired records)
```

### 7.3 Authentication & Authorization

```
STAFF AUTHENTICATION:
  - Primary: Email + password (bcrypt hashed, 12 rounds)
  - 2FA: TOTP (Google Authenticator) — optional for owners, mandatory for GMs
  - Tablet quick-login: 4-digit PIN (bcrypt hashed, separate from password)
  - Session: JWT (15-min access) + HTTP-only refresh token (7-day)
  - Property switching: Cross-property access for group managers

ROLE-BASED ACCESS CONTROL (RBAC):

┌─────────────────────┬──────────────────────────────────────────────────┐
│ Role                │ Permissions                                       │
├─────────────────────┼──────────────────────────────────────────────────┤
│ owner               │ Full access; financial reports; settings; staff  │
│ general_manager     │ Full operational; read financials; staff mgmt    │
│ front_desk          │ Reservations; check-in/out; folio; messaging     │
│ housekeeping_sup    │ Housekeeping; work orders; room status           │
│ housekeeper         │ Room status updates; checklist completion        │
│ maintenance         │ Work orders; maintenance schedules               │
│ food_beverage       │ Menu management; F&B reports; KDS                │
│ pos_staff           │ POS terminal; orders; payments                   │
│ readonly            │ View-only access (auditors, accountants)         │
└─────────────────────┴──────────────────────────────────────────────────┘

API AUTHORIZATION:
  - Every API request validated against RBAC
  - Property-scoped: user can only access their assigned property
  - Audit logged: every create/update/delete operation
```

### 7.4 Hardware Integration API Strategy

```
SMART LOCK INTEGRATION:
  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │  Hotelia Core    │────▶│ Lock Adapter      │────▶│ Lock Cloud API   │
  │  (reservation    │     │ (vendor-specific  │     │ (ASSA ABLOY /    │
  │   .checked_in)   │     │  translation)     │     │  SALTO / etc.)   │
  └──────────────────┘     └──────────────────┘     └──────────────────┘

  Integration flow:
  1. Guest checks in → event emitted: reservation.checked_in
  2. Lock adapter subscribes to event
  3. Adapter generates time-bound access credential (valid: check_in → check_out + 1hr)
  4. Pushes credential to lock vendor API
  5. Guest receives digital key (BLE/NFC) or physical key card programmed at front desk
  6. On checkout: credential automatically revoked
  7. On extension: credential validity updated in real-time

  PBX INTEGRATION:
  - Hotel PMS ↔ PBX link for room status synchronization
  - Guest check-in → phone enabled, wake-up calls activated
  - Guest checkout → phone disabled, voicemail cleared
  - Integration via SIP API or hotel-specific PBX protocol

  PAYMENT HARDWARE:
  - Stripe Terminal for physical card readers
  - Integration via Stripe's SDK (React Native for POS)
  - End-to-end encryption from card reader to Stripe
  - Support: tap, chip, swipe, Apple Pay, Google Pay
```

---

## 8. Development Roadmap & MVP Phases

### Phase 1: MVP (Months 1–4)

**Target: 50-room boutique hotel can open and operate fully.**

```
SPRINT 1-2 (Weeks 1-4): Foundation
  ├── Project scaffolding (monorepo, Docker, CI/CD)
  ├── PostgreSQL schema + Prisma setup
  ├── Authentication (staff login, JWT sessions)
  ├── Property & room configuration
  ├── Basic tape chart (read-only, 7-day view)
  └── Staff user management + RBAC

SPRINT 3-4 (Weeks 5-8): Core PMS
  ├── Reservation CRUD
  ├── Interactive tape chart (drag-drop reassignment)
  ├── Room assignment engine (basic)
  ├── Check-in / check-out workflows
  ├── Continuous financial ledger (room charges)
  ├── Basic folio management
  ├── Guest profile creation
  └── Audit logging

SPRINT 5-6 (Weeks 9-12): Operations
  ├── Housekeeping mobile interface
  ├── Room status state machine
  ├── Work order creation (manual)
  ├── Basic POS (room charge posting)
  ├── Staff task allocation
  └── Night audit report (automated, continuous)

SPRINT 7-8 (Weeks 13-16): Revenue & Launch
  ├── Rate plan management
  ├── Daily rate calendar (manual pricing)
  ├── Direct booking engine widget
  ├── Basic channel manager (Booking.com XML)
  ├── Guest PWA (basic info, QR menu)
  ├── Offline mode (front desk)
  └── Production deployment + UAT
```

**MVP Feature Checklist:**

| Module         | Feature                  | Priority | Status |
| -------------- | ------------------------ | -------- | ------ |
| PMS            | Tape chart (interactive) | P0       |        |
| PMS            | Reservation CRUD         | P0       |        |
| PMS            | Check-in / Check-out     | P0       |        |
| PMS            | Room status tracking     | P0       |        |
| PMS            | Continuous ledger        | P0       |        |
| PMS            | Folio management         | P0       |        |
| PMS            | Tax engine (basic)       | P0       |        |
| PMS            | Night audit report       | P0       |        |
| PMS            | Offline mode             | P0       |        |
| Housekeeping   | Mobile room status       | P0       |        |
| Housekeeping   | Room checklist           | P1       |        |
| POS            | Room charge posting      | P0       |        |
| POS            | Basic menu items         | P1       |        |
| RMS            | Rate plan management     | P0       |        |
| RMS            | Daily rate calendar      | P0       |        |
| RMS            | Direct booking widget    | P1       |        |
| RMS            | Booking.com channel      | P1       |        |
| CRM            | Guest profiles           | P0       |        |
| CRM            | Stay history             | P0       |        |
| Guest PWA      | QR-code info page        | P1       |        |
| Security       | Staff auth (JWT)         | P0       |        |
| Security       | RBAC                     | P0       |        |
| Security       | PCI compliance (Stripe)  | P0       |        |
| Security       | Audit logging            | P0       |        |
| Infrastructure | Docker + CI/CD           | P0       |        |
| Infrastructure | Monitoring (Sentry)      | P1       |        |

### Phase 2: Growth (Months 5–8)

```
FEATURES:
  ├── AI Dynamic Pricing Engine
  │   ├── Occupancy-based rate adjustment
  │   ├── Demand pacing algorithm
  │   ├── Event calendar integration
  │   └── Rate floor/ceiling controls
  │
  ├── Unified Messaging Hub
  │   ├── WhatsApp Business integration
  │   ├── SMS via Twilio
  │   ├── Staff inbox UI
  │   ├── AI auto-response agent
  │   └── Guest context sidebar
  │
  ├── Guest QR Ordering
  │   ├── Menu management
  │   ├── QR code generation per room
  │   ├── Guest ordering PWA
  │   ├── Kitchen Display System (KDS)
  │   ├── Order status tracking
  │   └── Payment integration (room charge + card)
  │
  ├── Advanced Work Orders
  │   ├── Preventive maintenance scheduling
  │   ├── SLA tracking & escalation
  │   ├── Photo attachments
  │   └── Recurring work orders
  │
  ├── Contactless Check-in
  │   ├── ID upload & verification
  │   ├── Credit card pre-authorization
  │   ├── Digital signature
  │   └── Room preference selection
  │
  └── Multi-OTA Channel Manager
      ├── Expedia integration
      ├── Airbnb integration (iCal)
      └── Two-way sync conflict resolution
```

### Phase 3: Enterprise (Months 9–12)

```
FEATURES:
  ├── Multi-Property Management
  │   ├── Group dashboard
  │   ├── Cross-property guest profiles
  │   ├── Central reservation office
  │   ├── Inter-property transfers
  │   └── Consolidated financial reporting
  │
  ├── Advanced Workforce
  │   ├── Dynamic labor rostering
  │   ├── Shift scheduling with forecasting
  │   ├── Staff performance analytics
  │   └── Overtime optimization
  │
  ├── Smart Lock Integration
  │   ├── BLE digital keys (ASSA ABLOY)
  │   ├── NFC wallet keys
  │   └── Remote lock management
  │
  ├── Business Intelligence
  │   ├── Revenue analytics dashboard
  │   ├── Occupancy forecasting
  │   ├── Guest segmentation analysis
  │   ├── Channel performance comparison
  │   ├── Staff productivity metrics
  │   └── Exportable reports (PDF, CSV, Excel)
  │
  ├── Advanced POS
  │   ├── Physical POS terminal (React + Electron)
  │   ├── Table management
  │   ├── Inventory tracking
  │   └── End-of-day Z-reports
  │
  └── Platform Features
      ├── White-label support
      ├── API for third-party integrations
      ├── Webhook management UI
      ├── Bulk operations (CSV import)
      └── Audit trail search & export
```

### 8.2 Development Team Recommendation (MVP Phase)

| Role                | Count | Focus                                              |
| ------------------- | ----- | -------------------------------------------------- |
| Full-Stack Lead     | 1     | Architecture decisions, code review, critical path |
| Full-Stack Engineer | 2     | PMS, folio, POS modules                            |
| Frontend Engineer   | 1     | Tape chart, housekeeping UI, guest PWA             |
| Backend Engineer    | 1     | Event system, channel manager, integrations        |
| DevOps / Platform   | 1     | Infrastructure, CI/CD, monitoring                  |
| Product / Design    | 1     | UX design, user research, spec writing             |
| **Total**           | **7** |                                                    |

### 8.3 Cost Estimates (MVP Phase — 4 Months)

| Category                                | Monthly | Total         |
| --------------------------------------- | ------- | ------------- |
| Team (7 engineers avg $10K/mo)          | $70,000 | $280,000      |
| Infrastructure (Railway/Render)         | $500    | $2,000        |
| Third-party APIs (Stripe, Twilio, etc.) | $200    | $800          |
| Design tools (Figma)                    | $75     | $300          |
| **Total**                               |         | **~$283,100** |

---

## 9. Appendices

### 9.1 API Endpoint Summary

| Module      | Endpoint Pattern                  | Method         | Description              |
| ----------- | --------------------------------- | -------------- | ------------------------ |
| Auth        | `/api/auth/login`                 | POST           | Staff login              |
| Auth        | `/api/auth/refresh`               | POST           | Token refresh            |
| PMS         | `/api/reservations`               | GET/POST       | List/create reservations |
| PMS         | `/api/reservations/:id`           | GET/PUT/DELETE | Reservation CRUD         |
| PMS         | `/api/reservations/:id/checkin`   | POST           | Check-in workflow        |
| PMS         | `/api/reservations/:id/checkout`  | POST           | Checkout workflow        |
| PMS         | `/api/rooms`                      | GET/POST       | Room management          |
| PMS         | `/api/rooms/:id/status`           | PUT            | Update room status       |
| PMS         | `/api/tape-chart`                 | GET            | Tape chart data          |
| PMS         | `/api/folios/:id`                 | GET            | Folio details            |
| PMS         | `/api/folios/:id/items`           | POST           | Post line item           |
| POS         | `/api/orders`                     | GET/POST       | Order management         |
| POS         | `/api/orders/:id/status`          | PUT            | Update order status      |
| POS         | `/api/menu`                       | GET/POST       | Menu management          |
| RMS         | `/api/rate-plans`                 | GET/POST       | Rate plan management     |
| RMS         | `/api/daily-rates`                | GET/PUT        | Daily rate management    |
| RMS         | `/api/channels`                   | GET/POST       | Channel configuration    |
| CRM         | `/api/guests`                     | GET/POST       | Guest search/create      |
| CRM         | `/api/guests/:id`                 | GET/PUT        | Guest profile            |
| CRM         | `/api/guests/:id/stays`           | GET            | Stay history             |
| Messaging   | `/api/conversations`              | GET/POST       | Conversations            |
| Messaging   | `/api/conversations/:id/messages` | GET/POST       | Messages                 |
| Work Orders | `/api/work-orders`                | GET/POST       | Work order management    |
| Reports     | `/api/reports/night-audit`        | GET            | Night audit report       |
| Reports     | `/api/reports/revenue`            | GET            | Revenue analytics        |

### 9.2 Event Schema Registry

| Event Name                | Publisher      | Consumers                         | Payload                                |
| ------------------------- | -------------- | --------------------------------- | -------------------------------------- |
| `reservation.created`     | PMS            | CRM, Channels                     | `{ reservation, guest }`               |
| `reservation.checked_in`  | PMS            | Housekeeping, CRM, POS, Messaging | `{ reservation, room, guest }`         |
| `reservation.checked_out` | PMS            | Housekeeping, CRM, POS, Revenue   | `{ reservation, folio_summary }`       |
| `reservation.cancelled`   | PMS            | Channels, Revenue                 | `{ reservation, reason }`              |
| `room.status_changed`     | Housekeeping   | PMS, RMS                          | `{ room, oldStatus, newStatus }`       |
| `folio.balance_updated`   | PMS            | CRM, Analytics                    | `{ folioId, oldBalance, newBalance }`  |
| `order.placed`            | POS            | KDS, PMS (folio)                  | `{ order, items }`                     |
| `order.delivered`         | POS            | Guest PWA                         | `{ orderId }`                          |
| `payment.captured`        | Stripe webhook | PMS, CRM                          | `{ payment, folioId }`                 |
| `work_order.created`      | PMS, Guest     | Maintenance, Supervisor           | `{ workOrder }`                        |
| `work_order.completed`    | Maintenance    | PMS, Guest, CRM                   | `{ workOrder }`                        |
| `daily_rate.changed`      | Revenue        | Channels                          | `{ ratePlan, date, oldRate, newRate }` |
| `guest.message_received`  | Messaging      | CRM, AI Agent                     | `{ conversation, message }`            |

### 9.3 Performance Targets

| Metric                                | Target                   | Measurement            |
| ------------------------------------- | ------------------------ | ---------------------- |
| Tape chart initial render (200 rooms) | < 200ms                  | Lighthouse, Web Vitals |
| API response time (p95)               | < 150ms                  | Prometheus metrics     |
| Real-time event propagation           | < 500ms                  | Event timestamp delta  |
| Offline reconnection sync             | < 5s for 100 pending ops | IndexedDB replay timer |
| Guest PWA first contentful paint      | < 1.5s (4G)              | Lighthouse             |
| POS terminal transaction              | < 2s end-to-end          | Stripe + API timing    |
| Database query (p99)                  | < 50ms                   | pg_stat_statements     |
| System uptime                         | 99.9%                    | Uptime monitoring      |
| Backup RPO                            | < 5 minutes              | WAL archiving          |
| Backup RTO                            | < 1 hour                 | Restore testing        |

### 9.4 Disaster Recovery

```
BACKUP STRATEGY:
  - PostgreSQL: Continuous WAL archiving to S3 (point-in-time recovery)
  - Redis: RDB snapshots every 5 minutes + AOF
  - Object storage: Versioning enabled, cross-region replication
  - Configuration: Git (infrastructure as code)

RECOVERY:
  - Database: Point-in-time restore to any minute within 30-day window
  - Application: Redeploy from container image (immutable deploys)
  - Full restore target: < 1 hour RTO, < 5 min RPO

HIGH AVAILABILITY (Phase 3):
  - PostgreSQL: Read replicas + automatic failover
  - Application: Multi-instance with load balancer
  - Redis: Sentinel for automatic failover
  - Multi-AZ deployment
```

---

_End of Architecture Blueprint — Version 1.0_
_Document to be reviewed and updated at each phase gate._
