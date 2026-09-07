// @hotelia/integrations — External hardware & service integrations
// Stub module; implementations added per Phase

export interface SmartLockAdapter {
  name: string;
  issueCredential(params: {
    roomId: string;
    guestId: string;
    validFrom: Date;
    validUntil: Date;
  }): Promise<{ credentialId: string; protocol: string }>;
  revokeCredential(credentialId: string): Promise<{ success: boolean }>;
  getStatus(roomId: string): Promise<{ locked: boolean; battery: number; lastActivity: Date }>;
}

export interface PBXAdapter {
  name: string;
  enableRoomPhone(roomNumber: string, guestId: string): Promise<void>;
  disableRoomPhone(roomNumber: string): Promise<void>;
  setWakeUpCall(roomNumber: string, time: Date): Promise<{ confirmationId: string }>;
  cancelWakeUpCall(roomNumber: string, confirmationId: string): Promise<void>;
}

export interface PaymentTerminalAdapter {
  name: string;
  initialize(): Promise<void>;
  charge(amount: number, currency: string): Promise<{ paymentIntentId: string }>;
  refund(paymentIntentId: string, amount: number): Promise<{ refundId: string }>;
}
