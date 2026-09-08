/**
 * Renderer-side contract mirroring the frozen preload bridge.
 *
 * IMPORTANT: these are pure TYPE declarations. The real implementation lives
 * in the main-process `dist` (preload/index.js) and is reached exclusively
 * through the electron `contextBridge`. The renderer has no queue of its own —
 * every durable mutation happens in the main-process SQLite store.
 */

export type SyncAction =
  | 'checkin'
  | 'checkout'
  | 'roomKeyGenerate'
  | 'posOrder'
  | 'folioTransfer'
  | 'maintenanceOrder'
  | 'etimsInvoice';

export type ActionStatus = 'PENDING' | 'PROCESSING' | 'FAILED' | 'COMPLETED';

export interface OfflineActionRecord {
  id: string;
  actionType: SyncAction;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: ActionStatus;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface SyncStatus {
  queued: number;
  processing: number;
  failed: number;
  online: boolean;
  oldest: number | null;
}

export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type LockChannels = 'tcp' | 'serial';

export interface LockDevice {
  id: string;
  channel: LockChannels;
  endpoint: string;
  model: string;
  online: boolean;
}

export interface EncodeRequest {
  deviceId: string;
  roomNumber: string;
  credential: string;
}

export interface EncodeResult {
  deviceId: string;
  roomNumber: string;
  credential: string;
  status: 'encoded' | 'queued_offline' | 'error';
  queuedId?: string;
  error?: string;
  ts: string;
}

// ── Live DB view shapes (main-process prisma → normalized DTOs) ────────────

export interface FrontDeskRoom {
  id: string;
  number: string;
  floor: number | null;
  type: string;
  status: string;
  baseRate: string | null;
  occupancy: Array<{ firstName: string; lastName: string }>;
  balance: string | null;
}

export interface ReservationRow {
  id: string;
  confirmationNo: string;
  roomNumber: string | null;
  guest: { firstName: string; lastName: string };
  status: string;
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
  status: string;
  hasDeparture: boolean;
  openWorkOrders: number;
  workOrderSubjects: string[];
}

export interface PosVerification {
  verified: boolean;
  reason: 'NO_ACTIVE_STAY' | 'LASTNAME_MISMATCH' | 'VERIFIED';
  guest?: { id: string; firstName: string; lastName: string };
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

export interface SyncEnqueueInput {
  actionType: SyncAction;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export interface PosVerifyInput {
  propertyId: string;
  roomNumber: string;
  lastName: string;
}

export interface PosChargeInput extends PosVerifyInput {
  description: string;
  amount: number;
  itemName?: string;
  operatorId?: string;
}

export type PaymentMethod = 'CASH' | 'MPESA_TILL' | 'MPESA_PAYBILL' | 'CARD';
export type PaymentKind = 'INTENT' | 'CONFIRMATION' | 'REVERSAL';
export type PaymentStatus = 'PENDING' | 'MATCHED' | 'UNMATCHED' | 'REVERSED';
export type EtimsState = 'NOT_APPLICABLE' | 'QUEUED' | 'TRANSMITTED';

export interface PaymentLedgerRow {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  etimsState: EtimsState;
  method: PaymentMethod;
  amount: number;
  currency: string;
  guestName: string;
  roomNumber: string;
  reference?: string;
  receipt?: string;
  folioId?: string;
  reservationId?: string;
  operatorId?: string;
  idempotencyKey: string;
  recordedAt: string;
  matchedAt: string | null;
  matchedIntentId: string | null;
}

export interface MpesaLedgerSummary {
  pendingIntents: number;
  unmatchedConfirmations: number;
  matched: number;
  reversed: number;
  todayTotalMinorByMethod: Partial<Record<PaymentMethod, number>>;
}

export interface PaymentRecordInput {
  method: PaymentMethod;
  amount: number;
  currency: string;
  guestName: string;
  roomNumber: string;
  reference?: string;
  folioId?: string;
  reservationId?: string;
  idempotencyKey: string;
  operatorId?: string;
}

export interface PaymentConfirmationInput {
  receipt: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string;
  phoneTail?: string;
  idempotencyKey: string;
}

export interface ConsoleBridge {
  readonly version: string;
  readonly sync: {
    enqueue(input: SyncEnqueueInput): Promise<CommandResult<OfflineActionRecord>>;
    status(): Promise<CommandResult<SyncStatus>>;
    recent(): Promise<CommandResult<OfflineActionRecord[]>>;
    subscribe(on: (status: SyncStatus) => void): () => void;
  };
  readonly locks: {
    list(): Promise<CommandResult<LockDevice[]>>;
    encode(opts: EncodeRequest): Promise<CommandResult<EncodeResult>>;
    link(opts: { channel: LockChannels; endpoint?: string }): Promise<CommandResult<unknown>>;
  };
  readonly pms: {
    board(propertyId: string): Promise<CommandResult<FrontDeskBoard>>;
  };
  readonly housekeeping: {
    tasks(propertyId: string): Promise<CommandResult<HousekeepingTask[]>>;
  };
  readonly pos: {
    verify(input: PosVerifyInput): Promise<CommandResult<PosVerification>>;
    postCharge(input: PosChargeInput): Promise<CommandResult<PosChargeResult>>;
  };
  readonly conf: {
    get(): Promise<
      CommandResult<{
        server: { url: string; port: number; token: string };
        db: { available: boolean };
        propertyId: string | null;
        currency: string;
      }>
    >;
  };
  readonly win: {
    control(
      action: 'minimize' | 'toggle-maximize' | 'close',
    ): Promise<CommandResult<{ action: string }>>;
    subscribeMaximized(on: (maximized: boolean) => void): () => void;
  };
  readonly payments: {
    recordIntent(input: PaymentRecordInput): Promise<CommandResult<PaymentLedgerRow>>;
    recordConfirmation(input: PaymentConfirmationInput): Promise<CommandResult<PaymentLedgerRow>>;
    match(input: {
      confirmationId: string;
      intentId: string;
      operatorId?: string;
    }): Promise<CommandResult<PaymentLedgerRow | null>>;
    list(): Promise<CommandResult<PaymentLedgerRow[]>>;
    summary(): Promise<CommandResult<MpesaLedgerSummary>>;
  };
}

declare global {
  interface Window {
    hotelia?: ConsoleBridge;
  }
}
