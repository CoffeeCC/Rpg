// Card chrome: framing is a plain CSS beveled border (see .playing-card and
// .card-art-window in battle.css), not painted frame art - the old
// full-card picture-frame PNGs (one per rarity) had a fixed opening that
// didn't line up with the card's actual name/art/type/text sections, so
// their border thickness read inconsistently (thick at the bottom, broken
// up at the top by the name plate sitting above it in z-order). CardArtBackdrop
// fills the art window with type-tinted fog over near-black (unchanged, still SVG).
import type { CardType } from '../engine/types';

export const TYPE_TINT: Record<CardType, string> = {
  strike: '#8a3a30',
  spell: '#3d5a8a',
  guard: '#5c6068',
  tactic: '#6d5a2e',
  summon: '#4a7040',
};

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
