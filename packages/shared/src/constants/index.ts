export const ROOM_STATUS_LABELS: Record<string, string> = {
  VACANT_DIRTY: 'Vacant Dirty',
  VACANT_CLEAN: 'Vacant Clean',
  VACANT_INSPECTED: 'Vacant Inspected',
  OCCUPIED_DIRTY: 'Occupied Dirty',
  OCCUPIED_CLEAN: 'Occupied Clean',
  OUT_OF_ORDER: 'Out of Order',
  OUT_OF_SERVICE: 'Out of Service',
};

export const ROOM_STATUS_COLORS: Record<string, string> = {
  VACANT_DIRTY: 'bg-amber-100 text-amber-700',
  VACANT_CLEAN: 'bg-emerald-100 text-emerald-700',
  VACANT_INSPECTED: 'bg-blue-100 text-blue-700',
  OCCUPIED_DIRTY: 'bg-orange-100 text-orange-700',
  OCCUPIED_GREEN: 'bg-sky-100 text-sky-700',
  OCCUPIED_CLEAN: 'bg-sky-100 text-sky-700',
  OUT_OF_ORDER: 'bg-rose-100 text-rose-700',
  OUT_OF_SERVICE: 'bg-slate-100 text-slate-700',
};

export const RESERVATION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-sky-100 text-sky-700',
  CHECKED_IN: 'bg-emerald-100 text-emerald-700',
  CHECKED_OUT: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-rose-100 text-rose-700',
  NO_SHOW: 'bg-rose-100 text-rose-700',
};

export const WORK_ORDER_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-sky-100 text-sky-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-rose-100 text-rose-700',
};
