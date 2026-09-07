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
