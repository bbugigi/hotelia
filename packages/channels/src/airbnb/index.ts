import type { ChannelAdapter } from '../index';

export class AirbnbAdapter implements ChannelAdapter {
  readonly name = 'airbnb';

  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  async pushInventory(_params: {
    roomType: string;
    date: string;
    rate: number;
    available: number;
    closed: boolean;
  }) {
    // TODO: Airbnb uses iCal for basic sync; full API via Airbnb Professional Host API
    return { success: false, syncId: 'not_implemented' };
  }

  async receiveBooking(_rawPayload: unknown) {
    return Promise.reject(new Error('Not implemented'));
  }

  async cancelBooking(_channelRef: string, _reason?: string) {
    return Promise.reject(new Error('Not implemented'));
  }

  async healthCheck() {
    return { connected: false };
  }
}
