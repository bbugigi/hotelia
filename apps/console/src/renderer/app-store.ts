/**
 * Minimal external store for cross-view live data (rendered via the
 * React 18 `useSyncExternalStore` hook). Views PUBLISH the latest board /
 * tasks they load; the titlebar nav counts, command palette and quick-peek
 * all read from the SAME snapshot — no prop drilling, no polling.
 */
import { useSyncExternalStore } from 'react';
import type { FrontDeskBoard, HousekeepingTask, SyncStatus } from './types';
import type { ConsoleConfig, ViewKey } from './App';

export interface AppState {
  view: ViewKey;
  config: ConsoleConfig | null;
  status: SyncStatus | null;
  board: FrontDeskBoard | null;
  tasks: HousekeepingTask[] | null;
}

const initialState: AppState = {
  view: 'frontdesk',
  config: null,
  status: null,
  board: null,
  tasks: null,
};

let state: AppState = initialState;
const listeners = new Set<() => void>();

const listenersList = listeners;
export function subscribeAppStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listenersList.delete(listener);
}

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const appStore = {
  get: (): AppState => state,
  navigate(view: ViewKey): void {
    if (view !== state.view) setState({ view });
  },
  setConfig(config: ConsoleConfig | null): void {
    setState({ config });
  },
  setStatus(status: SyncStatus | null): void {
    setState({ status });
  },
  setBoard(board: FrontDeskBoard | null): void {
    setState({ board });
  },
  setTasks(tasks: HousekeepingTask[] | null): void {
    setState({ tasks });
  },
};

export function useAppStore(): AppState {
  return useSyncExternalStore(subscribeAppStore, appStore.get);
}
