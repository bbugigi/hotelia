/**
 * Ctrl+K command palette — the single front-door for an ops console.
 * Keyboard-driven, filtered, with live results from the board.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewKey } from './App';
import type { FrontDeskRoom } from './types';
import { appStore } from './app-store';
import {
  IconFrontDesk,
  IconHousekeeping,
  IconLedger,
  IconPos,
  IconSearch,
  IconSettings,
} from './icons';

export interface PaletteCommand {
  id: string;
  label: string;
  group: 'views' | 'actions' | 'rooms';
  keywords?: string[];
  run(): void;
}

interface Props {
  open: boolean;
  onClose(): void;
  onOpen(): void;
  commands: PaletteCommand[];
}

const VIEW_ICONS: Record<ViewKey, typeof IconFrontDesk> = {
  frontdesk: IconFrontDesk,
  housekeeping: IconHousekeeping,
  pos: IconPos,
  messaging: IconFrontDesk,
  workorders: IconFrontDesk,
  revenue: IconFrontDesk,
  reconciliation: IconLedger,
  settings: IconSettings,
};

export function Palette({ open, onClose, commands }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    );
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  const run = useCallback(
    (cmd: PaletteCommand) => {
      cmd.run();
      onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="palette-overlay"
      role="dialog"
      aria-label="Command palette"
      onMouseDown={onClose}
    >
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <IconSearch size={18} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Type a command or room..."
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, filtered.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === 'Enter' && filtered[cursor]) run(filtered[cursor]);
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <ul className="palette-list">
          {filtered.length === 0 && <li className="palette-empty">No matches</li>}
          {filtered.map((c, i) => {
            const Icon =
              c.group === 'views' && (VIEW_ICONS as Record<string, typeof IconFrontDesk>)[c.id]
                ? (VIEW_ICONS as Record<string, typeof IconFrontDesk>)[c.id]
                : undefined;
            return (
              <li
                key={c.id}
                className={`palette-item ${i === cursor ? 'selected' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(c);
                }}
              >
                <span className="palette-item-icon">
                  {Icon ? <Icon size={16} /> : c.group === 'actions' ? '⚡' : '🏨'}
                </span>
                <span className="palette-item-label">{c.label}</span>
                <span className="palette-item-group">{c.group}</span>
              </li>
            );
          })}
        </ul>
        <div className="palette-hint">↑↓ navigate &middot; ↵ select &middot; esc dismiss</div>
      </div>
    </div>
  );
}

/**
 * Build a palette command list from the live app state (rooms in board,
 * standard view switches, and critical actions).
 */
export function usePaletteCommands(): PaletteCommand[] {
  const { board } = appStore.get();
  return useMemo(() => {
    const views: PaletteCommand[] = [
      {
        id: 'frontdesk',
        label: 'Front Desk',
        group: 'views',
        run: () => appStore.navigate('frontdesk'),
      },
      {
        id: 'housekeeping',
        label: 'Housekeeping',
        group: 'views',
        run: () => appStore.navigate('housekeeping'),
      },
      { id: 'pos', label: 'POS', group: 'views', run: () => appStore.navigate('pos') },
      {
        id: 'messaging',
        label: 'Messaging',
        group: 'views',
        run: () => appStore.navigate('messaging'),
      },
      {
        id: 'workorders',
        label: 'Work Orders',
        group: 'views',
        run: () => appStore.navigate('workorders'),
      },
      { id: 'revenue', label: 'Revenue', group: 'views', run: () => appStore.navigate('revenue') },
      {
        id: 'reconciliation',
        label: 'Reconciliation',
        group: 'views',
        run: () => appStore.navigate('reconciliation'),
      },
      {
        id: 'settings',
        label: 'Settings',
        group: 'views',
        run: () => appStore.navigate('settings'),
      },
      { id: 'refresh', label: 'Refresh board', group: 'actions', run: () => location.reload() },
    ];
    const rooms: PaletteCommand[] = (board?.rooms ?? []).map((r: FrontDeskRoom) => ({
      id: `room-${r.number}`,
      label: `Room ${r.number} — ${r.status.toLowerCase().replace(/_/g, ' ')}${r.occupancy.length > 0 ? ` · ${r.occupancy.map((o) => o.lastName).join(', ')}` : ''}`,
      group: 'rooms' as const,
      keywords: [
        r.number,
        r.status,
        r.type,
        ...r.occupancy.flatMap((o) => [o.firstName, o.lastName]),
      ],
      run: () => {
        appStore.navigate('frontdesk');
        window.dispatchEvent(new CustomEvent('palette:room', { detail: r.number }));
      },
    }));
    return [...views, ...rooms];
  }, [board]);
}
