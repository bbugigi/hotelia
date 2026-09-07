import type { ChannelAdapter } from '../index';

/**
 * Direct booking widget adapter.
 * Unlike OTA adapters, this handles the hotel's own booking engine.
 * No external sync needed — writes directly to database.
 */
export class DirectBookingAdapter implements ChannelAdapter {
  readonly name = 'direct';

  async pushInventory(_params: {
    roomType: string;
    date: string;
    rate: number;
    available: number;
    closed: boolean;
  }) {
    // Direct bookings don't need external sync
    // Inventory is already in the database
    return { success: true, syncId: 'local' };
  }

  async receiveBooking(rawPayload: unknown) {
    const payload = rawPayload as {
      guestName: string;
      email: string;
      checkIn: string;
      checkOut: string;
      roomType: string;
      rate: number;
    };

    return {
      confirmationNo: `HTL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      guestName: payload.guestName,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      roomType: payload.roomType,
      rate: payload.rate,
      channelRef: 'direct',
    };
  }

  async cancelBooking(_channelRef: string, _reason?: string) {
    return { success: true };
  }

  async healthCheck() {
    return { connected: true };
  }
}
