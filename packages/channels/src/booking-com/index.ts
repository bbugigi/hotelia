import { TaxEngine } from '@hotelia/shared';
import type { ChannelAdapter } from '../index';

/**
 * Booking.com complication: prices arrive GROSS (VAT embedded) in many
 * markets. We normalize to Net + itemized tax the second they cross the
 * webhook boundary so the PMS core never stores a gross-ambiguous number.
 */
const TAX_PROFILE = { quotingGross: true, taxRules: [{ id: 'vat', name: 'VAT', rate: 0.1 }] };

export class BookingComAdapter implements ChannelAdapter {
  readonly name = 'booking.com';
  readonly taxProfile = TAX_PROFILE;

  private apiKey: string;
  private hotelId: string;
  private baseUrl = 'https://admin.booking.com/xml';

  constructor(config: { apiKey: string; hotelId: string }) {
    this.apiKey = config.apiKey;
    this.hotelId = config.hotelId;
  }

  async pushInventory(_params: {
    roomType: string;
    date: string;
    rate: import('../index').ChannelRate;
    available: number;
    closed: boolean;
  }) {
    // TODO: Implement Booking.com XML push API
    // 1. Build OTA_HotelAvailNotifRQ XML using _params.rate.grossAmount
    // 2. Sign request with API credentials
    // 3. POST to Booking.com endpoint
    // 4. Parse XML response for sync status

    return { success: false, syncId: 'not_implemented' };
  }

  /** Webhook → PMS. Gross in, normalized ChannelRate out. */
  async receiveBooking(rawPayload: unknown) {
    const payload = rawPayload as {
      guestName?: string;
      checkIn?: string;
      checkOut?: string;
      roomType?: string;
      grossAmount?: number;
      confirmationNo?: string;
      channelRef?: string;
    };

    if (typeof payload.grossAmount !== 'number') {
      return Promise.reject(new Error('Booking.com payload missing grossAmount'));
    }

    const rate = TaxEngine.normalizeRate({
      amount: payload.grossAmount,
      currency: 'USD',
      isGross: true,
      taxRules: [...this.taxProfile.taxRules],
    });

    return {
      confirmationNo:
        payload.confirmationNo ??
        `BKG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      guestName: payload.guestName ?? 'Unknown',
      checkIn: payload.checkIn ?? '',
      checkOut: payload.checkOut ?? '',
      roomType: payload.roomType ?? 'STANDARD',
      rate,
      channelRef: payload.channelRef ?? '',
    };
  }

  async cancelBooking(_channelRef: string, _reason?: string) {
    // TODO: Send cancellation to Booking.com
    return Promise.reject(new Error('Not implemented'));
  }

  async healthCheck() {
    return { connected: false };
  }
}
