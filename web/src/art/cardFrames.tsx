// Card chrome: CardOrnament is an absolutely-positioned painted frame image,
// one per rarity tier (Grok-painted, not procedural) - worn iron/leather for
// starter, plain carved wood for common, silver+gems for uncommon, ornate
// gold filigree for rare. CardArtBackdrop fills the art window with
// type-tinted fog over near-black (unchanged, still SVG).
import type { CardRarity, CardType } from '../engine/types';

export const TYPE_TINT: Record<CardType, string> = {
  strike: '#8a3a30',
  spell: '#3d5a8a',
  guard: '#5c6068',
  tactic: '#6d5a2e',
  summon: '#4a7040',
};

const FRAME_SRC: Record<CardRarity, string> = {
  starter: 'art/cards/frame_starter.png',
  common: 'art/cards/frame_common.png',
  uncommon: 'art/cards/frame_uncommon.png',
  rare: 'art/cards/frame_rare.png',
};

export function CardOrnament({ rarity }: { type: CardType; rarity: CardRarity }) {
  return (
    <div
      className={`card-ornament-frame rarity-frame-${rarity}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: `url(${FRAME_SRC[rarity]})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
    />
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
