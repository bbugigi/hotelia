import type { DomainEvent } from '../definitions';

type EventHandler<T extends object = object> = (event: DomainEvent<T>) => void | Promise<void>;

class EventBus {
  private handlers = new Map<string, EventHandler<object>[]>();
  private streamClient: any = null;

  subscribe<T extends object>(eventType: string, handler: EventHandler<T>): () => void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as EventHandler<object>);
    this.handlers.set(eventType, existing);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType) ?? [];
      this.handlers.set(
        eventType,
        handlers.filter((h) => h !== handler),
      );
    };
  }

  async emit<T extends object>(event: DomainEvent<T>): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];

    // Emit to local handlers
    await Promise.all(handlers.map((handler) => handler(event as DomainEvent<object>)));

    // Emit to Redis Streams if connected
    if (this.streamClient) {
      try {
        await this.streamClient.xAdd('stream:domain_events', '*', {
          type: event.type,
          propertyId: event.propertyId,
          payload: JSON.stringify(event.data),
          timestamp: event.timestamp,
        });
      } catch (err) {
        console.error(`[EventBus] Failed to publish event ${event.type} to Redis:`, err);
      }
    }
  }

  setStreamClient(client: any) {
    this.streamClient = client;
  }
}

function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createEvent<T>(
  type: string,
  propertyId: string,
  data: T,
  userId?: string,
): DomainEvent<T> {
  return {
    id: createEventId(),
    type,
    timestamp: new Date().toISOString(),
    propertyId,
    userId,
    data,
  };
}

export const eventBus = new EventBus();
