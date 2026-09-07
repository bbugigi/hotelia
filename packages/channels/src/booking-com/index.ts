import type { ChannelAdapter } from '../index';

export class BookingComAdapter implements ChannelAdapter {
  readonly name = 'booking.com';

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
    rate: number;
    available: number;
    closed: boolean;
  }) {
    // TODO: Implement Booking.com XML push API
    // 1. Build OTA_HotelAvailNotifRQ XML
    // 2. Sign request with API credentials
    // 3. POST to Booking.com endpoint
    // 4. Parse XML response for sync status

    return { success: false, syncId: 'not_implemented' };
  }

  async receiveBooking(_rawPayload: unknown) {
    // TODO: Parse Booking.com OTA_HotelResNotifRQ webhook
    // 1. Validate XML signature
    // 2. Extract reservation fields
    // 3. Map room type to internal type
    // 4. Return normalized booking

    return Promise.reject(new Error('Not implemented'));
  }

  async cancelBooking(_channelRef: string, _reason?: string) {
    // TODO: Send cancellation to Booking.com
    return Promise.reject(new Error('Not implemented'));
  }

  async healthCheck() {
    return { connected: false };
  }
}
