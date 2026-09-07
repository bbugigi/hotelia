import { TaxEngine } from '@hotelia/shared';
import type { ChannelAdapter, ChannelRate, ChannelTaxProfile } from '../index';

const TAX_PROFILE: ChannelTaxProfile = {
  quotingGross: false,
  taxRules: [{ id: 'city_tax', name: 'Guest city tax', rate: 0.04 }],
};

export class AirbnbAdapter implements ChannelAdapter {
  readonly name = 'airbnb';
  readonly taxProfile: ChannelTaxProfile = TAX_PROFILE;

  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  async pushInventory(_params: {
    roomType: string;
    date: string;
    rate: ChannelRate;
    available: number;
    closed: boolean;
  }) {
    // TODO: Airbnb iCal / Professional Host API using _params.rate.netAmount
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
      return Promise.reject(new Error('Airbnb payload missing netAmount'));
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
        `ABNB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
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
