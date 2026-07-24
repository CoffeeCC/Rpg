// Procedural per-gate floor/wall tile art, rendered UNDER the emoji/unit
// content of a map cell in FloorScreen. Replaces the flat "brown squares"
// look with pixel-art-flavored SVG that varies per gate and per tile.
//
// Determinism: the same (vx, vy) always renders the same variant — no
// Math.random() anywhere. This matters because FloorScreen re-renders on
// every step/turn (threat overlay, player position, HP), and a tile that
// changed its look between renders would read as flickering, not scenery.
//
// Style: dark-fantasy, desaturated, low-contrast. Decoration opacity stays
// low so emoji icons, unit tokens, the red "threat" tint, and the player
// token all stay readable sitting on top of this layer.
import type { ReactElement } from 'react';
import type { GateId } from '../engine/types';

interface TileTheme {
  floorBase: string;
  wallBase: string;
  accent: string;
}

export const GATE_TILE_THEMES: Record<GateId, TileTheme> = {
  verdant: { floorBase: '#1b2416', wallBase: '#0e130a', accent: '#6d9e5a' },
  hollow: { floorBase: '#282420', wallBase: '#16130f', accent: '#8f8a7c' },
  sunken: { floorBase: '#142426', wallBase: '#0b1719', accent: '#5f9391' },
  storm: { floorBase: '#20212e', wallBase: '#131420', accent: '#8fa4c4' },
  abyss: { floorBase: '#150e1c', wallBase: '#09060d', accent: '#8a6fb8' },
};

/** Spatial hash of grid coords -> stable non-negative int. No Math.random(). */
function hashCoord(vx: number, vy: number): number {
  return ((vx * 73856093) ^ (vy * 19349663)) >>> 0;
}

// ---------------------------------------------------------------------------
// Sparse painted set-dressing (water pools, debris, ruined doorways) scattered
// across plain floor tiles. Deterministic per (vx, vy) like the decor above —
// same tile always rolls the same prop, so it doesn't flicker between renders.
// ---------------------------------------------------------------------------

const TILE_PROPS = ['waterpool', 'debris', 'archway'] as const;
export type TileProp = (typeof TILE_PROPS)[number];

/** ~1 in 15 floor tiles gets a prop; deterministic, no engine/gameplay effect. */
export function pickTileProp(vx: number, vy: number): TileProp | null {
  const hash = hashCoord(vx * 4297, vy * 2999);
  if (hash % 15 !== 0) return null;
  return TILE_PROPS[Math.floor(hash / 15) % TILE_PROPS.length];
}

// ---------------------------------------------------------------------------
// Floor decoration, per gate. Each takes a 0-3 variant index and returns a
// low-opacity overlay group so large open rooms don't look like a stamped-out
// grid of identical squares.
// ---------------------------------------------------------------------------

function verdantFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // grass tufts, lower-left
      return (
        <g stroke={accent} strokeWidth="2.2" fill="none" opacity="0.4" strokeLinecap="round">
          <path d="M22 78 q2 -10 -2 -16 M28 80 q0 -12 4 -18 M34 78 q3 -9 0 -15" />
        </g>
      );
    case 1:
      // tiny flower + root tendril
      return (
        <g opacity="0.45">
          <circle cx="70" cy="30" r="2.6" fill={accent} opacity="0.7" />
          <path d="M70 33 q-4 8 -10 10" stroke="#3c5233" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 2:
      // scattered dirt/leaf speckles
      return (
        <g fill={accent} opacity="0.3">
          <circle cx="46" cy="58" r="1.6" />
          <circle cx="60" cy="70" r="1.2" />
          <circle cx="38" cy="40" r="1.4" />
          <circle cx="72" cy="46" r="1" />
        </g>
      );
    default:
      // faint surface root crossing the tile
      return (
        <path
          d="M8 60 Q40 46 92 66"
          stroke="#0f150a"
          strokeWidth="3"
          fill="none"
          opacity="0.4"
          strokeLinecap="round"
        />
      );
  }
}

function verdantWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // dense trunk mass, off-center
      return (
        <g>
          <path d="M30 100 C 24 70 26 40 36 8 C 46 40 46 70 42 100 Z" fill="#0a0e07" opacity="0.85" />
          <path d="M64 100 C 60 74 64 44 74 14 C 82 44 80 74 76 100 Z" fill="#0a0e07" opacity="0.6" />
        </g>
      );
    case 1:
      // gnarled branches reaching across
      return (
        <g stroke="#141b0d" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.75">
          <path d="M10 20 C 30 30 46 26 60 12" />
          <path d="M20 70 C 40 64 56 72 88 62" />
        </g>
      );
    case 2:
      // hanging moss strands
      return (
        <g stroke={accent} strokeWidth="1.6" fill="none" opacity="0.3" strokeLinecap="round">
          <path d="M28 6 q6 40 -4 74" />
          <path d="M56 4 q-8 36 2 80" />
          <path d="M78 8 q6 34 -6 70" />
        </g>
      );
    default:
      // dense leaf canopy blotches
      return (
        <g fill="#0d1408" opacity="0.65">
          <ellipse cx="30" cy="26" rx="22" ry="16" />
          <ellipse cx="70" cy="60" rx="24" ry="18" />
          <ellipse cx="46" cy="82" rx="20" ry="14" />
        </g>
      );
  }
}

function hollowFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // zigzag crack
      return (
        <path
          d="M14 20 L28 38 L20 46 L40 68 L34 78"
          stroke="#100d09"
          strokeWidth="2.4"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
      );
    case 1:
      // pebble cluster
      return (
        <g fill={accent} opacity="0.3">
          <ellipse cx="64" cy="60" rx="4" ry="2.6" />
          <ellipse cx="72" cy="66" rx="3" ry="2" />
          <ellipse cx="60" cy="70" rx="2.4" ry="1.8" />
        </g>
      );
    case 2:
      // single deep fissure
      return (
        <path
          d="M84 10 L70 40 L78 50 L58 90"
          stroke="#0c0a07"
          strokeWidth="2.8"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
      );
    default:
      // stone-block grout seams
      return (
        <g stroke="#100d09" strokeWidth="1.4" opacity="0.4">
          <path d="M0 34 L48 34 L48 0 M48 34 L100 34 M48 34 L48 74 L100 74 M48 74 L48 100 M0 74 L48 74" fill="none" />
        </g>
      );
  }
}

function hollowWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // vertical crack
      return (
        <path
          d="M50 0 C 46 30 54 60 44 100"
          stroke="#0a0806"
          strokeWidth="3"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
      );
    case 1:
      // stalagmite hint from top edge
      return <path d="M50 0 L62 0 L56 26 Z" fill="#0a0806" opacity="0.75" />;
    case 2:
      // rough stone blotches
      return (
        <g fill="#0b0908" opacity="0.55">
          <ellipse cx="30" cy="34" rx="18" ry="14" />
          <ellipse cx="68" cy="66" rx="20" ry="16" />
        </g>
      );
    default:
      // horizontal seam band with pebble glints
      return (
        <g opacity="0.5">
          <path d="M0 50 L100 50" stroke="#0a0806" strokeWidth="2.6" />
          <circle cx="26" cy="50" r="1.6" fill={accent} opacity="0.5" />
          <circle cx="70" cy="50" r="1.4" fill={accent} opacity="0.4" />
        </g>
      );
  }
}

function sunkenFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // algae seam blob in a corner
      return <path d="M0 100 C 6 78 20 66 40 64 C 24 76 16 90 16 100 Z" fill={accent} opacity="0.24" />;
    case 1:
      // ripple glints
      return (
        <g stroke={accent} strokeWidth="1.6" fill="none" opacity="0.32" strokeLinecap="round">
          <path d="M18 40 Q 50 32 84 42" />
          <path d="M14 56 Q 50 48 88 58" />
        </g>
      );
    case 2:
      // flagstone grout cross
      return (
        <g stroke="#081213" strokeWidth="1.6" opacity="0.4">
          <path d="M0 50 L100 50 M50 0 L50 100" fill="none" />
        </g>
      );
    default:
      // faint algae speckles
      return (
        <g fill={accent} opacity="0.28">
          <circle cx="70" cy="26" r="1.6" />
          <circle cx="78" cy="34" r="1.2" />
          <circle cx="30" cy="78" r="1.4" />
        </g>
      );
  }
}

function sunkenWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // horizontal masonry courses
      return (
        <g stroke="#060f10" strokeWidth="2" opacity="0.5">
          <path d="M0 26 L100 26 M0 58 L100 58 M0 84 L100 84" fill="none" />
        </g>
      );
    case 1:
      // vertical block seam, offset coursing
      return (
        <g stroke="#060f10" strokeWidth="2" opacity="0.45">
          <path d="M34 0 L34 40 M70 0 L70 40 M14 40 L14 78 M54 40 L54 78 M86 40 L86 78 M34 78 L34 100 M70 78 L70 100" fill="none" />
        </g>
      );
    case 2:
      // faint carved rune glow
      return <circle cx="50" cy="50" r="3.2" fill={accent} opacity="0.3" />;
    default:
      // cracked masonry corner
      return (
        <path
          d="M100 0 L70 10 L78 30 L60 46"
          stroke="#050d0e"
          strokeWidth="2.6"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
      );
  }
}

function stormFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // lichen fleck cluster
      return (
        <g fill={accent} opacity="0.28">
          <circle cx="60" cy="70" r="2" />
          <circle cx="66" cy="64" r="1.4" />
          <circle cx="54" cy="76" r="1.2" />
        </g>
      );
    case 1:
      // snow patch
      return <ellipse cx="30" cy="30" rx="14" ry="8" fill="#c8d0dc" opacity="0.14" />;
    case 2:
      // wind-scour grooves
      return (
        <g stroke="#0d0e16" strokeWidth="1.6" fill="none" opacity="0.4" strokeLinecap="round">
          <path d="M10 20 Q 50 30 90 14" />
          <path d="M14 34 Q 50 44 86 30" />
        </g>
      );
    default:
      // scattered ice flecks
      return (
        <g fill="#c8d0dc" opacity="0.2">
          <circle cx="76" cy="50" r="1.4" />
          <circle cx="40" cy="82" r="1.2" />
          <circle cx="86" cy="80" r="1" />
        </g>
      );
  }
}

function stormWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // jagged diagonal crack
      return (
        <path
          d="M0 10 L30 40 L18 50 L54 90"
          stroke="#0a0b12"
          strokeWidth="2.8"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
      );
    case 1:
      // ledge highlight along the top
      return <path d="M0 6 L100 2 L100 12 L0 16 Z" fill={accent} opacity="0.14" />;
    case 2:
      // rough rock blotches
      return (
        <g fill="#0b0c14" opacity="0.5">
          <ellipse cx="36" cy="40" rx="20" ry="16" />
          <ellipse cx="70" cy="70" rx="18" ry="14" />
        </g>
      );
    default:
      // icy vein glint
      return (
        <path
          d="M20 0 C 30 30 20 60 40 100"
          stroke={accent}
          strokeWidth="1.6"
          fill="none"
          opacity="0.3"
          strokeLinecap="round"
        />
      );
  }
}

function abyssFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // thin ember vein
      return (
        <path
          d="M10 80 Q 40 60 30 30"
          stroke="#7a3a1e"
          strokeWidth="1.6"
          fill="none"
          opacity="0.4"
          strokeLinecap="round"
        />
      );
    case 1:
      // faint crack with violet glow
      return (
        <path
          d="M70 10 L60 40 L74 55 L64 90"
          stroke={accent}
          strokeWidth="1.4"
          fill="none"
          opacity="0.32"
          strokeLinecap="round"
        />
      );
    case 2:
      // single ember speck
      return <circle cx="55" cy="55" r="1.8" fill="#b3541e" opacity="0.5" />;
    default:
      // subtle obsidian sheen streak
      return <path d="M10 90 Q 50 50 90 10" stroke="#2a2036" strokeWidth="3" fill="none" opacity="0.3" strokeLinecap="round" />;
  }
}

function abyssWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // rim glow along the top edge
      return <path d="M0 4 L100 0 L100 10 L0 14 Z" fill={accent} opacity="0.16" />;
    case 1:
      // violet vein crack
      return (
        <path
          d="M40 0 C 50 30 34 60 50 100"
          stroke={accent}
          strokeWidth="1.8"
          fill="none"
          opacity="0.34"
          strokeLinecap="round"
        />
      );
    case 2:
      // ember glow speck
      return <circle cx="66" cy="60" r="2.2" fill="#b3541e" opacity="0.4" />;
    default:
      // near-invisible corner glow
      return <ellipse cx="86" cy="14" rx="16" ry="12" fill={accent} opacity="0.12" />;
  }
}

const FLOOR_DECOR: Record<GateId, (variant: number, accent: string) => ReactElement> = {
  verdant: verdantFloorDecor,
  hollow: hollowFloorDecor,
  sunken: sunkenFloorDecor,
  storm: stormFloorDecor,
  abyss: abyssFloorDecor,
};

const WALL_DECOR: Record<GateId, (variant: number, accent: string) => ReactElement> = {
  verdant: verdantWallDecor,
  hollow: hollowWallDecor,
  sunken: sunkenWallDecor,
  storm: stormWallDecor,
  abyss: abyssWallDecor,
};

// ---------------------------------------------------------------------------
// Shell: base fill + directional shading so adjacent tiles read as continuous
// ground rather than a grid of stamped squares. Floors get a darker top edge
// (as if in the shadow of the tile above); walls get a lit top edge.
// ---------------------------------------------------------------------------

function tileShell(size: number, gid: string, base: string, decor: ReactElement, isWall: boolean): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="presentation"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id={`${gid}-sh`} x1="0" y1="0" x2="0" y2="1">
          {isWall ? (
            <>
              <stop offset="0%" stopColor="#fff" stopOpacity="0.1" />
              <stop offset="14%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#000" stopOpacity="0.24" />
              <stop offset="16%" stopColor="#000" stopOpacity="0" />
              <stop offset="88%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
            </>
          )}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={base} />
      {decor}
      <rect x="0" y="0" width="100" height="100" fill={`url(#${gid}-sh)`} />
    </svg>
  );
}

const WALL_TILE = '#';

/**
 * Floor/wall art meant to sit UNDER a map cell's emoji/unit content.
 * Deterministic per (vx, vy): same coordinates -> identical markup, always.
 */
export function TileFill({
  gateId,
  tile,
  vx,
  vy,
  size,
}: {
  gateId: GateId;
  tile: string;
  vx: number;
  vy: number;
  size: number;
}): ReactElement | null {
  const theme = GATE_TILE_THEMES[gateId];
  if (!theme) return null;

  const hash = hashCoord(vx, vy);
  const variant = hash % 4;
  const isWall = tile === WALL_TILE;
  const gid = `tf${isWall ? 'w' : 'f'}${vx}x${vy}`;

  if (isWall) {
    return tileShell(size, gid, theme.wallBase, WALL_DECOR[gateId](variant, theme.accent), true);
  }
  return tileShell(size, gid, theme.floorBase, FLOOR_DECOR[gateId](variant, theme.accent), false);
}
