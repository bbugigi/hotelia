import { eventBus } from '../emitter';
import type { DomainEvent } from '../definitions';

// ──────────────────────────────────────────────
// Event Type Constants
// ──────────────────────────────────────────────

export const EVENT_TYPES = {
  // Reservations
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_CONFIRMED: 'reservation.confirmed',
  RESERVATION_CHECKED_IN: 'reservation.checked_in',
  RESERVATION_CHECKED_OUT: 'reservation.checked_out',
  RESERVATION_CANCELLED: 'reservation.cancelled',

  // Rooms
  ROOM_STATUS_CHANGED: 'room.status_changed',
  ROOM_KEY_GENERATED: 'room.key_generated',

  // Folio
  FOLIO_BALANCE_UPDATED: 'folio.balance_updated',

  // POS
  ORDER_PLACED: 'order.placed',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_PREPARING: 'order.preparing',
  ORDER_READY: 'order.ready',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_COMPLETED: 'order.completed',

  // Payments
  PAYMENT_AUTHORIZED: 'payment.authorized',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_REFUNDED: 'payment.refunded',

  // Work Orders
  WORK_ORDER_CREATED: 'work_order.created',
  WORK_ORDER_ASSIGNED: 'work_order.assigned',
  WORK_ORDER_COMPLETED: 'work_order.completed',

  // Revenue
  DAILY_RATE_CHANGED: 'daily_rate.changed',

  // Messaging
  GUEST_MESSAGE_RECEIVED: 'guest.message_received',
} as const;

// ──────────────────────────────────────────────
// Handler Registration
// ──────────────────────────────────────────────

type EventPayloadMap = Record<string, unknown>;

export function registerHandlers(
  handlers: {
    eventType: string;
    handler: (event: DomainEvent<EventPayloadMap>) => void | Promise<void>;
  }[],
) {
  for (const { eventType, handler } of handlers) {
    eventBus.subscribe(eventType, handler);
  }
}

// Placeholder for default cross-module handlers
export function registerDefaultHandlers() {
  // These will be implemented as modules are built out
  // e.g., reservation.checked_in → updates housekeeping status
  //        reservation.checked_in → activates room charge on folio
  //        reservation.checked_in → sends welcome message

  registerHandlers([
    {
      eventType: EVENT_TYPES.ROOM_STATUS_CHANGED,
      handler: (event) => {
        console.log(`[Handlers] Room ${event.data.roomNumber} → ${event.data.newStatus}`);
      },
    },
    {
      eventType: EVENT_TYPES.ORDER_PLACED,
      handler: (event) => {
        console.log(`[Handlers] Order ${event.data.orderId} placed — routing to KDS`);
      },
    },
  ]);
}
