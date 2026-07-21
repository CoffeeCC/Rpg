// Per-class targeting-line styling and per-race battle cursors — the
// "who you are" visual identity layer for the battle stage.
import type { ClassName, RaceName } from '../engine/types';

export interface ClassLineStyle {
  color: string;
  snapColor: string;
  dash: string;
  width: number;
  curve: 'arc' | 'straight' | 'wave';
  /** Only used when curve === 'arc'; how tall the arc bows, relative to horizontal span. */
  arcHeight?: number;
  /** Marker path in a 0 0 10 10 viewBox, tip pointing toward +x (orient=auto rotates it). */
  marker: string;
}

export const CLASS_LINE_STYLE: Record<ClassName, ClassLineStyle> = {
  Warrior: {
    color: '#c1503a',
    snapColor: '#f0a83c',
    dash: '10 8',
    width: 2.5,
    curve: 'arc',
    arcHeight: 0.15,
    marker: 'M0,0 L10,5 L0,10 L2.6,5 Z', // concave arrowhead
  },
  Knight: {
    color: '#9db4c9',
    snapColor: '#dce8f2',
    dash: '3 3',
    width: 3,
    curve: 'arc',
    arcHeight: 0.08, // heavier, more direct thrust
    marker: 'M0,5 L6,0 L10,5 L6,10 Z', // lance/diamond tip
  },
  Mage: {
    color: '#8a6fe0',
    snapColor: '#c9a8ff',
    dash: '1 7',
    width: 2,
    curve: 'arc',
    arcHeight: 0.3, // dramatic spell arc
    marker: 'M5,0 L6.4,3.6 L10,5 L6.4,6.4 L5,10 L3.6,6.4 L0,5 L3.6,3.6 Z', // sparkle
  },
  Thief: {
    color: '#4a8a52',
    snapColor: '#8ee08e',
    dash: '5 5',
    width: 1.5,
    curve: 'straight', // quick, direct — no wasted motion
    marker: 'M0,4.5 L9,2 L10,5 L9,8 L0,5.5 Z', // thin dagger blade
  },
  Bard: {
    color: '#c98a4a',
    snapColor: '#f0c884',
    dash: '1 5',
    width: 2,
    curve: 'wave', // a little song in the swing
    marker: 'M5,1 L8,4.5 L5,9 L2,4.5 Z', // note-head diamond
  },
};

export function buildTargetLinePath(style: ClassLineStyle, x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  if (style.curve === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (style.curve === 'wave') {
    const px = -dy / dist;
    const py = dx / dist;
    const amp = dist * 0.09;
    const c1x = x1 + dx / 3 + px * amp;
    const c1y = y1 + dy / 3 + py * amp;
    const c2x = x1 + (dx * 2) / 3 - px * amp;
    const c2y = y1 + (dy * 2) / 3 - py * amp;
    return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
  }
  const height = style.arcHeight ?? 0.15;
  const xc = (x1 + x2) / 2;
  const yc = Math.min(y1, y2) - Math.abs(dx) * height;
  return `M ${x1} ${y1} Q ${xc} ${yc} ${x2} ${y2}`;
}

const RACE_CURSOR_SVG: Record<RaceName, string> = {
  Human:
    '<path d="M2,2 L20,10 L11,13 L8,22 Z" fill="#d8d4c8" stroke="#2a2620" stroke-width="1.4" stroke-linejoin="round"/>',
  Elf:
    '<path d="M2,2 L22,7 L10,10 L7,23 Z" fill="#a8dcb0" stroke="#20362a" stroke-width="1.2" stroke-linejoin="round"/>',
  Dwarf:
    '<path d="M2,2 L18,6 L12,11 L9,19 Z" fill="#c98a4a" stroke="#33210f" stroke-width="1.6" stroke-linejoin="round"/>',
  Orc:
    '<path d="M2,4 L13,2 L20,8 L17,15 L9,19 L3,13 Z" fill="#8a7458" stroke="#241d13" stroke-width="1.4" stroke-linejoin="round"/>',
};

/** Full CSS `cursor` value: a small race-flavored pointer replacement, hotspot near the tip. */
export function raceCursor(race: RaceName): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${RACE_CURSOR_SVG[race]}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, auto`;
}
