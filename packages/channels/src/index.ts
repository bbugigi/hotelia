import type { TaxLine, TaxRule } from '@hotelia/shared';

/**
 * THE cross-channel price unit. No adapter is allowed to emit a bare number:
 * every OTA price must be expressed as Net + itemized tax before it touches
 * the PMS core event bus (loophole #6 fix). Booking.com (gross) is converted
 * down to net via TaxEngine on the way in; Expedia/Airbnb (net) stays net.
 */
export interface ChannelRate {
  netAmount: number;
  grossAmount: number;
  taxAmount: number;
  taxItems: TaxLine[];
  currency: string;
}

/** Per-channel tax convention declared once per adapter. */
export interface ChannelTaxProfile {
  /** true when the channel quotes GROSS (tax included, e.g. Booking.com) */
  quotingGross: boolean;
  taxRules: TaxRule[];
}

export interface ChannelAdapter {
  readonly name: string;
  /** Declared so revenue modules & nightly audit can recompute checks. */
  readonly taxProfile: ChannelTaxProfile;

  /** Push rate and availability for a room type on a date to the channel */
  pushInventory(params: {
    roomType: string;
    date: string;
    rate: ChannelRate;
    available: number;
    closed: boolean;
  }): Promise<{ success: boolean; syncId: string }>;

  /** Receive a booking from the channel (webhook callback handler) */
  receiveBooking(rawPayload: unknown): Promise<{
    confirmationNo: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    roomType: string;
    rate: ChannelRate;
    channelRef: string;
  }>;

  /** Cancel a booking on the channel */
  cancelBooking(channelRef: string, reason?: string): Promise<{ success: boolean }>;

  /** Health check for the channel connection */
  healthCheck(): Promise<{ connected: boolean; latency?: number }>;
}

/** Export the shared tax types so adapters stay in sync with the core. */
export type { TaxLine, TaxRule };
