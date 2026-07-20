import type { ClassName, MonsterRarity } from '../engine/types';
import { MonsterArt } from './monsterArt';
import { HeroArt } from './heroArt';
import { PAINTED_MONSTERS, PAINTED_HEROES } from './paintedCharacters';

/**
 * Painted monster art (Grok-generated, on pure black, composited with
 * mix-blend-mode: screen so the black vanishes over dark scenes). Falls back
 * to the procedural SVG silhouette when no painting exists or the render is
 * too small to read (map tokens, sidebar minis).
 */
export function MonsterImage({
  speciesId,
  size,
  rarity = 'Common',
  boss = false,
  facing = 'left',
}: {
  speciesId: string;
  size: number;
  rarity?: MonsterRarity;
  boss?: boolean;
  facing?: 'left' | 'right';
}) {
  const src = PAINTED_MONSTERS[speciesId];
  if (!src || size < 60) return <MonsterArt speciesId={speciesId} size={size} rarity={rarity} boss={boss} />;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      className={`painted-figure rarity-${rarity.toLowerCase()} ${boss ? 'boss-figure' : ''} ${facing === 'right' ? 'flip' : ''}`}
      draggable={false}
    />
  );
}

export function HeroImage({ className, size }: { className: ClassName; size: number }) {
  const src = PAINTED_HEROES[className];
  if (!src) return <HeroArt className={className} size={size} />;
  return <img src={src} width={size} height={Math.round(size * 1.25)} alt="" className="painted-figure hero-painted" draggable={false} />;
}
