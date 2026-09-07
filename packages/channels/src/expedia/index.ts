import type { ChannelAdapter } from '../index';

export class ExpediaAdapter implements ChannelAdapter {
  readonly name = 'expedia';

  private apiKey: string;
  private cid: string;

  constructor(config: { apiKey: string; cid: string }) {
    this.apiKey = config.apiKey;
    this.cid = config.cid;
  }

  async pushInventory(_params: {
    roomType: string;
    date: string;
    rate: number;
    available: number;
    closed: boolean;
  }) {
    // TODO: Implement Expedia Switch API push
    return { success: false, syncId: 'not_implemented' };
  }

  async receiveBooking(_rawPayload: unknown) {
    // TODO: Parse Expedia webhook
    return Promise.reject(new Error('Not implemented'));
  }

  async cancelBooking(_channelRef: string, _reason?: string) {
    return Promise.reject(new Error('Not implemented'));
  }

  async healthCheck() {
    return { connected: false };
  }
}
