import { z } from 'zod';

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const pinLoginSchema = z.object({
  pin: z.string().length(4),
  propertyId: z.string().uuid(),
});

// ──────────────────────────────────────────────
// Reservations
// ──────────────────────────────────────────────

export const createReservationSchema = z.object({
  guestId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(10).default(1),
  children: z.number().int().min(0).max(10).default(0),
  roomType: z.enum(['STANDARD', 'SUPERIOR', 'DELUXE', 'SUITE', 'PENTHOUSE', 'VILLA']),
  ratePlan: z.string().optional(),
  nightlyRate: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  specialRequests: z.string().max(1000).optional(),
  source: z
    .enum(['DIRECT', 'BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'PHONE', 'WALK_IN'])
    .default('DIRECT'),
});

export const checkInSchema = z.object({
  roomId: z.string().uuid(),
  creditCardToken: z.string().optional(),
  idDocumentUrl: z.string().url().optional(),
  digitalSignature: z.string().optional(),
});

export const checkOutSchema = z.object({
  paymentMethod: z.enum(['CREDIT_CARD', 'CASH', 'APPLE_PAY', 'GOOGLE_PAY']),
  paymentIntentId: z.string().optional(),
});

// ──────────────────────────────────────────────
// Guests
// ──────────────────────────────────────────────

export const createGuestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().length(3).optional(),
  dietaryPrefs: z.array(z.string()).default([]),
  accessibility: z.array(z.string()).default([]),
  languagePref: z.string().default('en'),
  notes: z.string().max(2000).optional(),
});

// ──────────────────────────────────────────────
// POS / Orders
// ──────────────────────────────────────────────

export const createOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(z.object({ name: z.string(), price: z.number() })).default([]),
  specialRequests: z.string().max(500).optional(),
});

export const createOrderSchema = z.object({
  roomId: z.string().uuid().optional(),
  folioId: z.string().uuid().optional(),
  channel: z.enum(['QR_IN_ROOM', 'POS_TERMINAL', 'WEB_GUEST', 'PHONE', 'STAFF']),
  items: z.array(createOrderItemSchema).min(1),
  paymentMethod: z.enum(['room_charge', 'card', 'apple_pay', 'google_pay']).optional(),
});

// ──────────────────────────────────────────────
// Work Orders
// ──────────────────────────────────────────────

export const createWorkOrderSchema = z.object({
  roomId: z.string().uuid().optional(),
  category: z.enum(['MAINTENANCE', 'HOUSEKEEPING', 'GUEST_REQUEST', 'INSPECTION', 'EMERGENCY']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  assignedTo: z.string().uuid().optional(),
  slaDeadline: z.string().datetime().optional(),
});

// ──────────────────────────────────────────────
// Pricing
// ──────────────────────────────────────────────

export const updateDailyRateSchema = z.object({
  ratePlanId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rate: z.number().positive(),
  minRate: z.number().positive().optional(),
  maxRate: z.number().positive().optional(),
  isClosed: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

// ──────────────────────────────────────────────
// Console IPC contracts (validated on both sides)
// Schema ids: 'console' namespace so the desktop app and any future
// local-agent share the SAME accepted shapes.
// ──────────────────────────────────────────────

export const syncActionSchema = z.enum([
  'checkin',
  'checkout',
  'roomKeyGenerate',
  'posOrder',
  'folioTransfer',
  'maintenanceOrder',
  'etimsInvoice',
]);
export type SyncAction = z.infer<typeof syncActionSchema>;

// ──────────────────────────────────────────────
// Local payments / M-Pesa reconciliation ledger
// (Kenya-first: Till & Paybill are treated as first-class)
// ──────────────────────────────────────────────

export const paymentMethodSchema = z.enum(['CASH', 'MPESA_TILL', 'MPESA_PAYBILL', 'CARD']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentRecordSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default('KES'),
  guestName: z.string().min(1).max(200),
  roomNumber: z.string().min(1).max(10),
  reference: z.string().min(1).max(128).optional(),
  folioId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128),
  operatorId: z.string().uuid().optional(),
});
export type PaymentRecordInput = z.infer<typeof paymentRecordSchema>;

export const paymentConfirmationSchema = z.object({
  receipt: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9]+$/),
  amount: z.number().positive().max(10_000_000),
  currency: z.string().length(3).default('KES'),
  method: paymentMethodSchema,
  reference: z.string().min(1).max(128).optional(),
  phoneTail: z.string().max(4).optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type PaymentConfirmationInput = z.infer<typeof paymentConfirmationSchema>;

export const paymentMatchSchema = z.object({
  confirmationId: z.string().uuid(),
  intentId: z.string().uuid(),
  operatorId: z.string().uuid().optional(),
});
export type PaymentMatchInput = z.infer<typeof paymentMatchSchema>;

export const syncEnqueueSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  actionType: syncActionSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type SyncEnqueueInput = z.infer<typeof syncEnqueueSchema>;

/**
 * Shared contract for argument-less IPC handlers. The renderer may call with
 * nothing, or an empty object; either parses identically.
 */
export const ipcNoArgsSchema = z.undefined().or(z.object({}).passthrough());

export const lockChannelSchema = z.enum(['tcp', 'serial']);
export type LockChannel = z.infer<typeof lockChannelSchema>;

export const lockEncodeSchema = z.object({
  deviceId: z.string().min(1).max(100),
  roomNumber: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[a-zA-Z0-9-]+$/),
  credential: z.string().min(4),
});
export type LockEncodeInput = z.infer<typeof lockEncodeSchema>;

export const lockLinkSchema = z.object({
  channel: lockChannelSchema,
  endpoint: z.string().min(1).max(255).optional(),
});
export type LockLinkInput = z.infer<typeof lockLinkSchema>;

export const streamEventsSchema = z.array(z.string().min(1).max(255)).max(32);
export type StreamEventsInput = z.infer<typeof streamEventsSchema>;

export const packetSchema = z.object({
  type: z.string().min(1).max(255),
  payload: z.record(z.string(), z.unknown()),
});
export type PacketInput = z.infer<typeof packetSchema>;

// ──────────────────────────────────────────────
// Real-time DB reads (step 5)
// ──────────────────────────────────────────────

export const propertyQuerySchema = z.object({
  propertyId: z.string().uuid(),
});

export const posVerifySchema = z.object({
  propertyId: z.string().uuid(),
  roomNumber: z.string().min(1).max(10),
  lastName: z.string().min(1).max(100),
});
export type PosVerifyInput = z.infer<typeof posVerifySchema>;

export const posChargeSchema = posVerifySchema.extend({
  description: z.string().min(1).max(500),
  amount: z.number().positive().max(1_000_000),
  itemName: z.string().min(1).max(200).optional(),
  operatorId: z.string().uuid().optional(),
});
export type PosChargeInput = z.infer<typeof posChargeSchema>;
