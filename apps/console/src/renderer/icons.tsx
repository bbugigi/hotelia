/**
 * Tiny inline SVG icon set — no icon dependency, single currentColor stroke,
 * 24x24 viewBox. Rendering errors are impossible: these are static paths.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size = 18): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

export function IconFrontDesk(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M3 21h18M5 21V10l7-5 7 5v11" />
      <path d="M9 21v-6h6v6M9 10h.01M15 10h.01M12 7v.01M9.5 13h.01M14.5 13h.01M9.5 16h.01M14.5 16h.01M9.5 19h.01M14.5 19h.01" />
    </svg>
  );
}

export function IconHousekeeping(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M3 12l9-7 9 7M4 12v9h16v-9" />
      <path d="M8 21v-6h8v6M12 8v2" />
    </svg>
  );
}

export function IconPos(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M7 9h6M7 12h10M7 15h4M9 21h6M12 17v4" />
    </svg>
  );
}

export function IconMessaging(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.4-.7L3 20l.9-3.2A8 8 0 0 1 11.8 3.1a8.4 8.4 0 0 1 9.2 8.4Z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  );
}

export function IconWorkOrders(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M14.7 6.3a4.5 4.5 0 0 1-6 6L3 18v3h3l5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7Z" />
    </svg>
  );
}

export function IconRevenue(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
      <path d="M7 14h.01M11 10h.01M19 7h.01" />
    </svg>
  );
}

export function IconLedger(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M7 8h10M7 12h10M7 16h6" />
    </svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function IconBolt(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

export function IconMark(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M4 20V10a8 8 0 0 1 16 0v10" />
      <path d="M4 20h16M4 15h16" />
    </svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconMinimize(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconMaximize(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  );
}

export function IconRestore(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <rect x="5" y="8" width="11" height="11" rx="1.5" />
      <path d="M8 5h11v11" />
    </svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconInfo(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconMpesa(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 3v18M16 3v18M4 12h16M10 7h.01M14 7h.01M10 17h.01M14 17h.01" />
    </svg>
  );
}

export function IconKey(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <circle cx="8" cy="14" r="4.5" />
      <path d="M11.5 10.5 20 2M15 7l3 3" />
    </svg>
  );
}

export function IconArrowUp(p: IconProps) {
  return (
    <svg {...base(p.size)}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
