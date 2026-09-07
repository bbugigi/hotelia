import { Prisma, type Reservation, type Room } from '@prisma/client';
import { prisma } from './client';

export class InventoryError extends Error {
  constructor(
    public code: 'ROOM_NOT_FOUND' | 'ROOM_UNAVAILABLE' | 'SOLD_OUT' | 'INVENTORY_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'InventoryError';
  }
}

export interface AtomicReserveInput {
  propertyId: string;
  guestId: string;
  roomId: string;
  confirmationNo: string;
  source: Reservation['source'];
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  roomType: Reservation['roomType'];
  ratePlan?: string;
  nightlyRate: number;
  totalAmount: number;
  currency: string;
  otaReservationId?: string;
}

const OCCUPIED_STATUSES: Room['status'][] = ['OCCUPIED_DIRTY', 'OCCUPIED_CLEAN'];

/**
 * Loophole #4 fix — atomic inventory reservation.
 *
 * Two callers (Booking.com adapter AND the direct booking engine) can race for
 * the SAME last Deluxe room. A plain `if (room.available)` check is not atomic.
 *
 * This runs inside an interactive transaction and takes the Postgres
 * ROW-LEVEL LOCK (`SELECT ... FOR UPDATE`) on the room row first. The second
 * transaction blocks on the lock, then re-reads and sees the room already
 * taken — so the overbooking never reaches the write.
 */
export async function atomicReserveRoom(input: AtomicReserveInput): Promise<any> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(
        Prisma.sql`SELECT id, status FROM rooms WHERE id = ${input.roomId} FOR UPDATE`,
      );
      const room = rows[0];
      if (!room) throw new InventoryError('ROOM_NOT_FOUND', `Room ${input.roomId} does not exist`);
      if (OCCUPIED_STATUSES.includes(room.status as Room['status'])) {
        throw new InventoryError('ROOM_UNAVAILABLE', `Room ${input.roomId} is occupied`);
      }

      const reservation = await tx.reservation.create({
        data: {
          propertyId: input.propertyId,
          guestId: input.guestId,
          roomId: input.roomId,
          confirmationNo: input.confirmationNo,
          source: input.source,
          status: 'CONFIRMED',
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          adults: input.adults,
          children: input.children,
          roomType: input.roomType,
          ratePlan: input.ratePlan,
          nightlyRate: input.nightlyRate,
          totalAmount: input.totalAmount,
          currency: input.currency,
          otaReservationId: input.otaReservationId,
        },
      });

      await tx.room.update({
        where: { id: input.roomId },
        data: { status: 'OCCUPIED_DIRTY' },
      });

      await tx.roomStatusLog.create({
        data: {
          roomId: input.roomId,
          previousStatus: room.status as Room['status'],
          newStatus: 'OCCUPIED_DIRTY',
          source: input.source,
          notes: `Reservation ${input.confirmationNo} via ${input.source}`,
        },
      });

      return reservation;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

export interface LockChannelInventoryInput {
  propertyId: string;
  channel: string;
  date: Date;
  roomType: Reservation['roomType'];
}

/**
 * Loophole #4 fix (channel side) — atomically decrement the sellable room
 * count a given OTA sees for a room type / date. The FOR UPDATE guarantee is
 * identical to `atomicReserveRoom`: lost updates are impossible.
 */
export async function lockChannelInventory(input: LockChannelInventoryInput): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; available: number }>>(
        Prisma.sql`
          SELECT id, available FROM channel_inventory
          WHERE property_id = ${input.propertyId}
            AND room_type = ${input.roomType}::"RoomType"
            AND channel = ${input.channel}
            AND date = ${input.date}
          FOR UPDATE
        `,
      );
      const row = rows[0];
      if (!row)
        throw new InventoryError(
          'INVENTORY_NOT_FOUND',
          `No inventory row for ${input.roomType} on ${input.channel}`,
        );
      if (row.available <= 0)
        throw new InventoryError('SOLD_OUT', `Sold out: ${input.roomType} on ${input.channel}`);

      const after = row.available - 1;
      await tx.$executeRaw`
        UPDATE channel_inventory
        SET available = ${after}, last_synced_at = now()
        WHERE id = ${row.id}
      `;
      return after;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}
