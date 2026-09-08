/** Currency formatter — respects the property's configured currency (default KES). */
export function fmtCurrency(amount: number, currency = 'KES'): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Small clsx-like helper (no dependency). */
export function cn(...classes: Array<string | boolean | undefined | null>): string {
  return classes.filter(Boolean).join(' ');
}

/** Self-serve idempotency key for optimistic frontend enqueues. */
export function idempotencyKey(prefix = 'ipc'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
