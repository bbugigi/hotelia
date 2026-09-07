import { TaxEngine } from '@hotelia/shared';
import type { ChannelAdapter, ChannelRate, ChannelTaxProfile } from '../index';

/**
 * Expedia convention: rates arrive NET (tax itemized/added at checkout).
 * We still pass them through TaxEngine so the outgoing object is structurally
 * identical to every other channel — Net + itemized tax, no ambiguity.
 */
const TAX_PROFILE: ChannelTaxProfile = {
  quotingGross: false,
  taxRules: [{ id: 'vat', name: 'VAT', rate: 0.1 }],
};

export class ExpediaAdapter implements ChannelAdapter {
  readonly name = 'expedia';
  readonly taxProfile: ChannelTaxProfile = TAX_PROFILE;

  private apiKey: string;
  private cid: string;

  constructor(config: { apiKey: string; cid: string }) {
    this.apiKey = config.apiKey;
    this.cid = config.cid;
  }

  async pushInventory(_params: {
    roomType: string;
    date: string;
    rate: ChannelRate;
    available: number;
    closed: boolean;
  }) {
    // TODO: Implement Expedia Switch API push using _params.rate.netAmount
    return { success: false, syncId: 'not_implemented' };
  }

  async receiveBooking(rawPayload: unknown) {
    const payload = rawPayload as {
      guestName?: string;
      checkIn?: string;
      checkOut?: string;
      roomType?: string;
      netAmount?: number;
      confirmationNo?: string;
      channelRef?: string;
    };

    if (typeof payload.netAmount !== 'number') {
      return Promise.reject(new Error('Expedia payload missing netAmount'));
    }

    const rate = TaxEngine.normalizeRate({
      amount: payload.netAmount,
      currency: 'USD',
      isGross: false,
      taxRules: [...this.taxProfile.taxRules],
    });

    return {
      confirmationNo:
        payload.confirmationNo ??
        `EXP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      guestName: payload.guestName ?? 'Unknown',
      checkIn: payload.checkIn ?? '',
      checkOut: payload.checkOut ?? '',
      roomType: payload.roomType ?? 'STANDARD',
      rate,
      channelRef: payload.channelRef ?? '',
    };
  }

  async cancelBooking(_channelRef: string, _reason?: string) {
    return Promise.reject(new Error('Not implemented'));
  }

  async healthCheck() {
    return { connected: false };
  }
}
