export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  timestamp: string;
  propertyId: string;
  userId?: string;
  data: T;
}

// ──────────────────────────────────────────────
// Reservation Events
// ──────────────────────────────────────────────

export interface ReservationCreatedData {
  reservationId: string;
  guestId: string;
  roomId?: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  source: string;
  totalAmount: number;
}

export interface ReservationCheckedInData {
  reservationId: string;
  guestId: string;
  roomId: string;
  roomNumber: string;
  roomType: string;
}

export interface ReservationCheckedOutData {
  reservationId: string;
  guestId: string;
  roomId: string;
  roomNumber: string;
  folioId: string;
  totalAmount: number;
}

export interface ReservationCancelledData {
  reservationId: string;
  guestId: string;
  reason?: string;
}

// ──────────────────────────────────────────────
// Room Events
// ──────────────────────────────────────────────

export interface RoomStatusChangedData {
  roomId: string;
  roomNumber: string;
  previousStatus: string;
  newStatus: string;
  changedBy?: string;
}

// ──────────────────────────────────────────────
// Folio Events
// ──────────────────────────────────────────────

export interface FolioBalanceUpdatedData {
  folioId: string;
  reservationId: string;
  oldBalance: number;
  newBalance: number;
}

// ──────────────────────────────────────────────
// POS Events
// ──────────────────────────────────────────────

export interface OrderPlacedData {
  orderId: string;
  propertyId: string;
  roomId?: string;
  folioId?: string;
  channel: string;
  items: Array<{ menuItemId: string; name: string; quantity: number; price: number }>;
  total: number;
}

export interface OrderDeliveredData {
  orderId: string;
  deliveredBy?: string;
}

// ──────────────────────────────────────────────
// Payment Events
// ──────────────────────────────────────────────

export interface PaymentCapturedData {
  paymentId: string;
  folioId: string;
  amount: number;
  method: string;
  stripePaymentId?: string;
}

// ──────────────────────────────────────────────
// Work Order Events
// ──────────────────────────────────────────────

export interface WorkOrderCreatedData {
  workOrderId: string;
  category: string;
  priority: string;
  title: string;
  roomId?: string;
  assignedTo?: string;
}

export interface WorkOrderCompletedData {
  workOrderId: string;
  completedBy: string;
  resolutionNotes?: string;
}

// ──────────────────────────────────────────────
// Revenue Events
// ──────────────────────────────────────────────

export interface DailyRateChangedData {
  ratePlanId: string;
  date: string;
  oldRate: number;
  newRate: number;
  source: string;
}

// ──────────────────────────────────────────────
// Messaging Events
// ──────────────────────────────────────────────

export interface GuestMessageReceivedData {
  conversationId: string;
  guestId: string;
  channel: string;
  content: string;
  senderType: string;
}
