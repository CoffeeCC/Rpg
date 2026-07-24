// Card chrome: CardOrnament is an absolutely-positioned SVG overlay with
// filigree corner flourishes, double hairline borders, and a top-center gem.
// Tinted by card type, intensity by rarity ('rare' = gold glow).
// CardArtBackdrop fills the art window with type-tinted fog over near-black.
import { useId } from 'react';
import type { CardRarity, CardType } from '../engine/types';

export const TYPE_TINT: Record<CardType, string> = {
  strike: '#8a3a30',
  spell: '#3d5a8a',
  guard: '#5c6068',
  tactic: '#6d5a2e',
  summon: '#4a7040',
};

interface RarityStyle {
  line: string;
  opacity: number;
  width: number;
  glow: boolean;
}

const RARITY_STYLE: Record<CardRarity, RarityStyle> = {
  starter: { line: '#6e6656', opacity: 0.55, width: 0.6, glow: false },
  common: { line: '#8f8570', opacity: 0.7, width: 0.7, glow: false },
  uncommon: { line: '#a8b8c9', opacity: 0.85, width: 0.8, glow: false },
  rare: { line: '#c9a227', opacity: 1, width: 0.9, glow: true },
};

/** Corner flourish for the top-left corner; mirrored for the other three.
 *  The old design ended in two asymmetric curls that terminated mid-air —
 *  under mirroring they read as a snapped/broken bracket at the exposed
 *  top-right corner (the cost gem hid the same artifact at the top-left).
 *  This geometry is symmetric about the corner diagonal (every point (x,y)
 *  has its twin (y,x)) and every open end either sits exactly ON the inner
 *  border line (4.6) or runs along it, so all four mirror placements are
 *  pixel-identical at any render size. */
const CORNER =
  // outer bracket arc, springing from the inner border at both ends
  'M4.6 20 C 4.6 11.5 11.5 4.6 20 4.6 ' +
  // inner echo arc, concentric with the bracket
  'M7.2 17.4 C 7.2 11.8 11.8 7.2 17.4 7.2 ' +
  // serif tails running ALONG the inner border from each arc footing
  'M4.6 20 L4.6 25 M20 4.6 L25 4.6';

/** Small filled diamond accent seated on the corner diagonal. */
const CORNER_GEM = 'M11.2 8.4 L14 11.2 L11.2 14 L8.4 11.2 Z';

/** The four mirrored placements of CORNER inside the 100x140 frame. */
const CORNER_TRANSFORMS = [
  undefined,
  'translate(100 0) scale(-1 1)',
  'translate(0 140) scale(1 -1)',
  'translate(100 140) scale(-1 -1)',
];

export function CardOrnament({ type, rarity }: { type: CardType; rarity: CardRarity }) {
  const tint = TYPE_TINT[type];
  const r = RARITY_STYLE[rarity];
  // useId: the glow filter id must be unique PER CARD — a shared static id
  // (`cfg-rare-strike`) meant every rare card referenced whichever card's
  // <filter> happened to be first in the DOM, breaking glow when that card
  // left play. Colons are stripped: they are invalid inside url(#…) refs.
  const fid = `cfg-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {r.glow ? (
        <defs>
          <filter id={fid} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor={r.line} floodOpacity="0.8" />
          </filter>
        </defs>
      ) : null}

      <g filter={r.glow ? `url(#${fid})` : undefined}>
        {/* double hairline borders: outer rarity line, inner type-tinted line */}
        <rect
          x="2"
          y="2"
          width="96"
          height="136"
          rx="5"
          fill="none"
          stroke={r.line}
          strokeWidth={r.width}
          opacity={r.opacity}
        />
        <rect
          x="4.6"
          y="4.6"
          width="90.8"
          height="130.8"
          rx="3.5"
          fill="none"
          stroke={tint}
          strokeWidth={r.width * 0.75}
          opacity={r.opacity * 0.75}
        />

        {/* filigree corner flourishes — one path, four exact mirrors */}
        <g fill="none" stroke={r.line} strokeWidth={r.width} strokeLinecap="round" opacity={r.opacity}>
          {CORNER_TRANSFORMS.map((t, i) => (
            <path key={i} d={CORNER} transform={t} />
          ))}
        </g>
        <g fill={r.line} opacity={r.opacity * 0.85}>
          {CORNER_TRANSFORMS.map((t, i) => (
            <path key={i} d={CORNER_GEM} transform={t} />
          ))}
        </g>

        {/* top-center diamond gem, type-tinted with rarity setting */}
        <path d="M50 0.8 L54.4 6.5 L50 12.2 L45.6 6.5 Z" fill={tint} stroke={r.line} strokeWidth={r.width * 0.8} opacity={r.opacity} />
        <path d="M50 3.2 L52.4 6.5 L50 9.8 L47.6 6.5 Z" fill={r.line} opacity={r.opacity * 0.9} />
        <path d="M42 6.5 L45 6.5 M55 6.5 L58 6.5" stroke={r.line} strokeWidth={r.width * 0.7} opacity={r.opacity * 0.7} />

        {/* bottom-center diamond echo (tip kept inside the 140-unit viewBox) */}
        <path d="M50 133.6 L52.8 136.8 L50 139.6 L47.2 136.8 Z" fill={r.line} opacity={r.opacity * 0.7} />
      </g>
    </svg>
  );
}

export function CardArtBackdrop({ type }: { type: CardType }) {
  const tint = TYPE_TINT[type];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          `radial-gradient(ellipse 95% 70% at 50% 30%, ${tint}45 0%, transparent 68%), ` +
          `radial-gradient(ellipse 130% 55% at 50% 105%, rgba(0,0,0,0.75) 0%, transparent 62%), ` +
          'linear-gradient(180deg, #17141c 0%, #0c0a10 100%)',
      }}
    />
  );
}
