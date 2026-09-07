export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export type RoomStatus =
  | 'VACANT_DIRTY'
  | 'VACANT_CLEAN'
  | 'VACANT_INSPECTED'
  | 'OCCUPIED_DIRTY'
  | 'OCCUPIED_CLEAN'
  | 'OUT_OF_ORDER'
  | 'OUT_OF_SERVICE';

export type ReservationStatus =
  'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';

export type RoomType = 'STANDARD' | 'SUPERIOR' | 'DELUXE' | 'SUITE' | 'PENTHOUSE' | 'VILLA';

export type OrderStatus =
  'PLACED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

export type WorkOrderStatus =
  'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export type WorkOrderCategory =
  'MAINTENANCE' | 'HOUSEKEEPING' | 'GUEST_REQUEST' | 'INSPECTION' | 'EMERGENCY';

export interface TapeChartDay {
  date: string;
  dayOfWeek: string;
  isToday: boolean;
}

export interface TapeChartCell {
  roomId: string;
  roomNumber: string;
  floor: number;
  roomType: RoomType;
  date: string;
  status: RoomStatus;
  reservation?: {
    id: string;
    guestName: string;
    isVip: boolean;
    source: string;
  };
}
