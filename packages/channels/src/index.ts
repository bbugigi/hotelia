export interface ChannelAdapter {
  readonly name: string;

  /** Push rate and availability for a room type on a date to the channel */
  pushInventory(params: {
    roomType: string;
    date: string;
    rate: number;
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
    rate: number;
    channelRef: string;
  }>;

  /** Cancel a booking on the channel */
  cancelBooking(channelRef: string, reason?: string): Promise<{ success: boolean }>;

  /** Health check for the channel connection */
  healthCheck(): Promise<{ connected: boolean; latency?: number }>;
}
