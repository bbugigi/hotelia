import type {
  Folio,
  Guest,
  PrismaClient,
  Reservation,
  Room,
  RoomStatus as PrismaRoomStatus,
} from '@prisma/client';
import type { PosChargeInput, PosVerifyInput } from '@hotelia/shared';
import { round2 } from '@hotelia/shared';
import { getDb, getPrismaNs } from './db';
import { logger } from './logger';

/**
 * REAL DATABASE WIRING for the desktop views (Task 5).
 *
 * FrontDesk / Housekeeping / POS now read straight from the local Prisma
 * Postgres (the single source of truth for CRM + inventory + ledger) instead
 * of static sample arrays. Every IPC surface validates against the shared Zod
 * schemas first, and all Decimal/Date/Json values are normalized to plain
 * JSON-safe values before returning through Electron's structured-clone IPC.
 *
 * The POS trade here implements the strict *database* barrier the previous
 * renderer-side check could not guarantee:
 *
 *   1. a SERIALIZABLE transaction is opened,
 *   2. the ACTIVE Reservation (status = CHECKED_IN) for the POSTed
 *      roomNumber is looked up INSIDE that transaction,
 *   3. guest.lastName is compared case-insensitively against the caller's
 *      lastName — mismatch ⇒ the whole transaction aborts (no folio item),
 *   4. only then is a FolioLineItem created on an OPEN folio, the folio
 *      balance incremented, and an AUDIT row written as chargeback evidence.
 *
 * Because the check and the insert share one transaction, there is no
 * time-of-check/time-of-use race: a terminal cannot switch the room's guest
 * between the check and the insert.
 */

// ── DTO shapes (JSON-safe, structured-clone friendly) ─────────────────────

export interface FrontDeskRoom {
  id: string;
  number: string;
  floor: number | null;
  type: string;
  status: PrismaRoomStatus;
  baseRate: string | null;
  occupancy: Array<{ firstName: string; lastName: string }>;
  balance: string | null;
}

export interface ReservationRow {
  id: string;
  confirmationNo: string;
  roomNumber: string | null;
  guest: { firstName: string; lastName: string };
  status: Reservation['status'];
  checkInDate: string;
  checkOutDate: string;
}

export interface FrontDeskBoard {
  propertyId: string;
  rooms: FrontDeskRoom[];
  arrivals: ReservationRow[];
  departures: ReservationRow[];
}

export interface HousekeepingTask {
  roomId: string;
  roomNumber: string;
  status: PrismaRoomStatus;
  hasDeparture: boolean;
  openWorkOrders: number;
  workOrderSubjects: string[];
}

export interface PosGuestInfo {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PosVerification {
  verified: boolean;
  reason: 'NO_ACTIVE_STAY' | 'LASTNAME_MISMATCH' | 'VERIFIED';
  guest?: PosGuestInfo;
  reservation?: {
    id: string;
    confirmationNo: string;
    status: string;
    checkInDate: string;
    checkOutDate: string;
  };
}

export interface PosChargeResult {
  lineItemId: string;
  folioId: string;
  description: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  balance: number;
  barrier: {
    roomNumber: string;
    verifiedLastName: string;
    matchedGuestId: string;
    reservationId: string;
  };
}

export class PosBarrierError extends Error {
  constructor(
    public readonly barrier: 'NO_ACTIVE_STAY' | 'LASTNAME_MISMATCH' | 'FOLIO_CREATE_FAILED',
    message: string,
  ) {
    super(`POS_BARRIER_${barrier}: ${message}`);
    this.name = 'PosBarrierError';
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function todayDateOnly(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lowestRate(propertyConfig: unknown): number {
  const rate = (propertyConfig as { taxRate?: number } | null)?.taxRate;
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 0.18;
  return Math.min(Math.max(n, 0), 1);
}

function sourceModuleFor(description: string): 'POS_FOOD' | 'POS_BEVERAGE' {
  return /wine|beer|champagne|spirit|coffee|juice|tea/i.test(description)
    ? 'POS_BEVERAGE'
    : 'POS_FOOD';
}

// ── FrontDesk board: rooms + arrivals + departures, live from Postgres ─────

type RoomWithStay = Room & {
  reservations: Array<
    Reservation & {
      guest: Pick<Guest, 'firstName' | 'lastName'>;
      folios: Array<{ balance: unknown }>;
    }
  >;
};

export async function frontDeskBoard(propertyId: string): Promise<FrontDeskBoard> {
  const prisma = getDb();
  const today = todayDateOnly();

  const rooms = await prisma.room.findMany({
    where: { propertyId, isActive: true },
    include: {
      reservations: {
        where: { status: 'CHECKED_IN' },
        include: {
          guest: { select: { firstName: true, lastName: true } },
          folios: { where: { status: 'OPEN' }, select: { balance: true } },
        },
      },
    },
    orderBy: [{ floor: 'asc' }, { number: 'asc' }],
  });

  const boardRooms: FrontDeskRoom[] = (rooms as unknown as RoomWithStay[]).map((r) => {
    const balance = r.reservations
      .flatMap((res) => res.folios)
      .reduce((acc, f) => acc + Number(f.balance), 0);
    return {
      id: r.id,
      number: r.number,
      floor: r.floor,
      type: r.type,
      status: r.status,
      baseRate: r.baseRate?.toString() ?? null,
      occupancy: r.reservations.map((res) => res.guest),
      balance: balance === 0 ? null : balance.toFixed(2),
    };
  });

  const [arrivals, departures] = await Promise.all([
    prisma.reservation.findMany({
      where: { propertyId, status: 'CONFIRMED', checkInDate: today },
      include: { guest: { select: { firstName: true, lastName: true } }, room: true },
      orderBy: { checkInDate: 'desc' },
      take: 25,
    }),
    prisma.reservation.findMany({
      where: { propertyId, status: 'CHECKED_IN', checkOutDate: today },
      include: { guest: { select: { firstName: true, lastName: true } }, room: true },
      orderBy: { checkOutDate: 'desc' },
      take: 25,
    }),
  ]);

  const toRow = (
    r: Reservation & { guest: Pick<Guest, 'firstName' | 'lastName'>; room?: Room | null },
  ): ReservationRow => ({
    id: r.id,
    confirmationNo: r.confirmationNo,
    roomNumber: r.room?.number ?? null,
    guest: r.guest,
    status: r.status,
    checkInDate: dateOnlyString(r.checkInDate),
    checkOutDate: dateOnlyString(r.checkOutDate),
  });

  return {
    propertyId,
    rooms: boardRooms,
    arrivals: arrivals.map(toRow),
    departures: departures.map(toRow),
  };
}

// ── Housekeeping tasks: live room status + work orders + today departures ──

export async function housekeepingTasks(propertyId: string): Promise<HousekeepingTask[]> {
  const prisma = getDb();
  const today = todayDateOnly();

  const rooms = await prisma.room.findMany({
    where: { propertyId, isActive: true },
    include: {
      reservations: {
        where: { status: 'CHECKED_IN', checkOutDate: today },
        select: { id: true },
      },
      orderHistory: {
        where: { status: { in: ['PLACED', 'CONFIRMED', 'PREPARING'] } },
        select: { id: true },
      },
    },
    orderBy: [{ floor: 'asc' }, { number: 'asc' }],
  });

  const workOrders = await prisma.workOrder.findMany({
    where: { propertyId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    select: { roomId: true, title: true },
  });

  const byRoom = new Map<string, string[]>();
  for (const wo of workOrders) {
    if (!wo.roomId) continue;
    const list = byRoom.get(wo.roomId) ?? [];
    list.push(wo.title);
    byRoom.set(wo.roomId, list);
  }

  return rooms.map((r) => ({
    roomId: r.id,
    roomNumber: r.number,
    status: r.status,
    hasDeparture: r.reservations.length > 0,
    openWorkOrders: byRoom.get(r.id)?.length ?? 0,
    workOrderSubjects: byRoom.get(r.id) ?? [],
  }));
}

// ── POS: strict barrier verification ───────────────────────────────────────

async function activeStay(prisma: PrismaClient, propertyId: string, roomNumber: string) {
  return prisma.reservation.findFirst({
    where: {
      propertyId,
      status: 'CHECKED_IN',
      room: { is: { propertyId, number: roomNumber, isActive: true } },
    },
    include: {
      guest: true,
      room: true,
      folios: { where: { status: 'OPEN' } },
    },
  });
}

function pickOpenFolio(folios: Array<Pick<Folio, 'id' | 'type'>>): Pick<Folio, 'id'> | null {
  const personal = folios.find((f) => f.type === 'PERSONAL');
  if (personal) return personal;
  const master = folios.find((f) => f.type === 'MASTER');
  if (master) return master;
  return folios[0] ?? null;
}

export async function posVerifyGuest(input: PosVerifyInput): Promise<PosVerification> {
  const prisma = getDb();
  const stay = await activeStay(prisma, input.propertyId, input.roomNumber);
  if (!stay) {
    return { verified: false, reason: 'NO_ACTIVE_STAY' };
  }
  if (stay.guest.lastName.toLowerCase() !== input.lastName.toLowerCase()) {
    return {
      verified: false,
      reason: 'LASTNAME_MISMATCH',
      guest: { id: stay.guest.id, firstName: stay.guest.firstName, lastName: stay.guest.lastName },
      reservation: {
        id: stay.id,
        confirmationNo: stay.confirmationNo,
        status: stay.status,
        checkInDate: dateOnlyString(stay.checkInDate),
        checkOutDate: dateOnlyString(stay.checkOutDate),
      },
    };
  }
  return {
    verified: true,
    reason: 'VERIFIED',
    guest: { id: stay.guest.id, firstName: stay.guest.firstName, lastName: stay.guest.lastName },
    reservation: {
      id: stay.id,
      confirmationNo: stay.confirmationNo,
      status: stay.status,
      checkInDate: dateOnlyString(stay.checkInDate),
      checkOutDate: dateOnlyString(stay.checkOutDate),
    },
  };
}

/**
 * POST A CHARGE BEHIND THE STRICT DB BARRIER.
 *
 * Single SERIALIZABLE transaction: re-derives the active stay, enforces the
 * LastName/Room barrier, creates the FolioLineItem, increments the folio
 * balance and records the audit evidence — all-or-nothing.
 */
export async function posPostCharge(input: PosChargeInput): Promise<PosChargeResult> {
  const prisma = getDb();
  const Prisma = getPrismaNs();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const stay = await tx.reservation.findFirst({
          where: {
            propertyId: input.propertyId,
            status: 'CHECKED_IN',
            room: { is: { propertyId: input.propertyId, number: input.roomNumber } },
          },
          include: {
            guest: true,
            room: true,
            folios: { where: { status: 'OPEN' } },
          },
        });
        if (!stay || !stay.room) {
          throw new PosBarrierError(
            'NO_ACTIVE_STAY',
            `no CHECKED_IN stay on room ${input.roomNumber}`,
          );
        }

        const guardMatches = stay.guest.lastName.toLowerCase() === input.lastName.toLowerCase();
        if (!guardMatches) {
          throw new PosBarrierError(
            'LASTNAME_MISMATCH',
            `last name "${input.lastName}" does not match active guest "${stay.guest.lastName}" on room ${input.roomNumber}`,
          );
        }

        let folio = pickOpenFolio(stay.folios as Array<Pick<Folio, 'id' | 'type'>>);
        if (!folio) {
          const created = await tx.folio.create({
            data: {
              reservationId: stay.id,
              guestId: stay.guest.id,
              propertyId: input.propertyId,
              type: 'MASTER',
              status: 'OPEN',
              currency: stay.currency,
              balance: 0,
            },
            select: { id: true },
          });
          folio = created;
        }

        const taxRate = lowestRate(
          await tx.property.findUnique({ where: { id: input.propertyId } }).then((p) => p?.config),
        );
        const amount = round2(input.amount);
        const discount = 0;
        const gross = amount;
        const taxAmount = round2((gross - discount) * taxRate);
        const total = round2(gross - discount + taxAmount);

        const item = await tx.folioLineItem.create({
          data: {
            folioId: folio.id,
            kind: 'CHARGE',
            sourceModule: sourceModuleFor(input.description),
            description: input.description,
            quantity: 1,
            unitPrice: amount,
            taxRate,
            taxAmount,
            discountAmount: discount,
            total,
            businessDate: new Date(),
            metadata: {
              barrier: 'GUEST_LASTNAME_ROOM',
              roomNumber: input.roomNumber,
              guestId: stay.guest.id,
              itemName: input.itemName ?? null,
            },
          },
          select: { id: true },
        });

        const updatedFolio = await tx.folio.update({
          where: { id: folio.id },
          data: { balance: { increment: total } },
          select: { balance: true },
        });

        const auditOperator = input.operatorId ?? input.propertyId;
        await tx.auditLog.create({
          data: {
            propertyId: input.propertyId,
            userId: auditOperator,
            action: 'POS_CHARGE_VALIDATED',
            entityType: 'folio_line_items',
            entityId: item.id,
            newValue: {
              barrier: 'GUEST_LASTNAME_ROOM',
              roomNumber: input.roomNumber,
              verifiedLastName: input.lastName,
              matchedGuestId: stay.guest.id,
              reservationId: stay.id,
              description: input.description,
              amount,
            },
            oldValue: Prisma.JsonNull,
          },
        });

        logger.info('pos:charge-posted-behind-barrier', {
          folioId: folio.id,
          roomNumber: input.roomNumber,
          guestId: stay.guest.id,
          total: total.toFixed(2),
        });

        return {
          lineItemId: item.id,
          folioId: folio.id,
          description: input.description,
          amount,
          taxRate,
          taxAmount,
          total,
          balance: Number(updatedFolio.balance),
          barrier: {
            roomNumber: input.roomNumber,
            verifiedLastName: input.lastName,
            matchedGuestId: stay.guest.id,
            reservationId: stay.id,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof PosBarrierError) throw err;
    logger.error('pos:charge-transaction-failed', { roomNumber: input.roomNumber }, err as Error);
    throw err;
  }
}
