/**
 * Global keyboard shortcut hook — 1-7 for views, Ctrl/⌘+K for palette,
 * Escape (inherited by components), Space for room peek (FrontDesk listens).
 */
import { useEffect } from 'react';
import { appStore } from './app-store';
import type { ViewKey } from './App';

const VIEW_KEYS: ViewKey[] = [
  'frontdesk',
  'housekeeping',
  'pos',
  'messaging',
  'workorders',
  'revenue',
  'reconciliation',
];

export function useShortcuts(onTogglePalette: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea (but not when composing for IME).
      if (
        e.isComposing ||
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA'
      )
        return;

      // Ctrl / Cmd + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onTogglePalette();
        return;
      }

      // Number keys 1-7 (no modifier) for quick view switch.
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        appStore.navigate(VIEW_KEYS[num - 1]);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTogglePalette]);
}
