import { EVENT_TYPES } from './handlers';

/**
 * Central, validated registry of domain event names. The console's local SSE
 * broker and every adapter rely on this single source of truth so a mistyped
 * event type can never silently break real-time streams (loophole #7).
 */
export const eventRegistry = {
  ALL: '*',
  list(): string[] {
    return Object.values(EVENT_TYPES);
  },
  isValid(type: string): type is DomainEventName {
    return Object.values(EVENT_TYPES).includes(type as DomainEventName);
  },
  names(): string[] {
    return Object.keys(EVENT_TYPES);
  },
} as const;

export type DomainEventName = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
