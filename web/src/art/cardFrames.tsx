// Card chrome: CardOrnament is an absolutely-positioned SVG overlay with
// filigree corner flourishes, double hairline borders, and a top-center gem.
// Tinted by card type, intensity by rarity ('rare' = gold glow).
// CardArtBackdrop fills the art window with type-tinted fog over near-black.
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

/** One curled filigree flourish for the top-left corner; mirrored for the rest. */
const CORNER =
  'M3.5 17 C 3.5 9.5 9.5 3.5 17 3.5 M5.8 15 C 5.8 9.9 9.9 5.8 15 5.8 ' +
  'M17 3.5 c 3.2 0 5.4 1.7 5.4 4.1 c 0 2 -1.5 3.2 -3.2 3.2 c -1.3 0 -2.2 -0.9 -2.2 -2.1 ' +
  'M3.5 17 c 0 3.2 1.7 5.4 4.1 5.4 c 2 0 3.2 -1.5 3.2 -3.2 c 0 -1.3 -0.9 -2.2 -2.1 -2.2';

export function CardOrnament({ type, rarity }: { type: CardType; rarity: CardRarity }) {
  const tint = TYPE_TINT[type];
  const r = RARITY_STYLE[rarity];
  const fid = `cfg-${rarity}-${type}`;
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

        {/* filigree corner flourishes */}
        <g fill="none" stroke={r.line} strokeWidth={r.width} strokeLinecap="round" opacity={r.opacity}>
          <path d={CORNER} />
          <path d={CORNER} transform="translate(100 0) scale(-1 1)" />
          <path d={CORNER} transform="translate(0 140) scale(1 -1)" />
          <path d={CORNER} transform="translate(100 140) scale(-1 -1)" />
        </g>

        {/* top-center diamond gem, type-tinted with rarity setting */}
        <path d="M50 0.8 L54.4 6.5 L50 12.2 L45.6 6.5 Z" fill={tint} stroke={r.line} strokeWidth={r.width * 0.8} opacity={r.opacity} />
        <path d="M50 3.2 L52.4 6.5 L50 9.8 L47.6 6.5 Z" fill={r.line} opacity={r.opacity * 0.9} />
        <path d="M42 6.5 L45 6.5 M55 6.5 L58 6.5" stroke={r.line} strokeWidth={r.width * 0.7} opacity={r.opacity * 0.7} />

        {/* bottom-center diamond echo */}
        <path d="M50 133.5 L52.8 137 L50 140.2 L47.2 137 Z" fill={r.line} opacity={r.opacity * 0.7} />
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
          'var(--card-grain), ' +
          `radial-gradient(ellipse 95% 70% at 50% 30%, ${tint}45 0%, transparent 68%), ` +
          `radial-gradient(ellipse 130% 55% at 50% 105%, rgba(0,0,0,0.75) 0%, transparent 62%), ` +
          'linear-gradient(180deg, #17141c 0%, #0c0a10 100%)',
        backgroundSize: '90px 90px, auto, auto, auto',
        backgroundBlendMode: 'overlay, normal, normal, normal',
      }}
    />
  );
}
