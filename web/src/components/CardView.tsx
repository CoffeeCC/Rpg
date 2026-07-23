import { useState } from 'react';
import type { CardDef } from '../engine/types';
import type { Character } from '../engine/entities/Character';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { cardNumbers, cardEffectiveness } from '../engine/systems/cardBattle';
import { CardArtBackdrop } from '../art/cardFrames';
import { MonsterArt } from '../art/monsterArt';
import { CARD_ART } from '../art/cardArt';

export interface CardViewProps {
  card: CardDef;
  hero: Character;
  sourceMonster?: MonsterInstance;
  /** Rendered width in px (height follows the 5:7 card ratio). */
  width?: number;
  playable?: boolean;
  selected?: boolean;
  upgraded?: boolean;
  /** The enemy currently being aimed at, if any — folds elemental
   * effectiveness into the displayed damage while targeting is live. */
  previewTarget?: MonsterInstance;
}

const TYPE_LABEL: Record<CardDef['type'], string> = {
  strike: 'Strike',
  spell: 'Spell',
  guard: 'Guard',
  tactic: 'Tactic',
  summon: 'Summon',
};

export function CardView({ card, hero, sourceMonster, width = 216, playable = true, selected = false, upgraded = false, previewTarget }: CardViewProps) {
  const height = Math.round(width * 1.4);
  const numbers = cardNumbers(card, hero, sourceMonster, upgraded, previewTarget);
  const effectiveness = cardEffectiveness(card, previewTarget);
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const tiltable = card.rarity === 'rare';

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!tiltable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - py) * 14, y: (px - 0.5) * 16 });
  }

  return (
    <div
      className={`playing-card type-${card.type} rarity-card-${card.rarity} ${selected ? 'selected' : ''} ${playable ? '' : 'unplayable'} ${upgraded ? 'upgraded' : ''} ${tilt ? 'tilting' : ''}`}
      style={{
        width,
        height,
        ...(tilt ? ({ '--tiltX': `${tilt.x}deg`, '--tiltY': `${tilt.y}deg` } as React.CSSProperties) : {}),
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt(null)}
    >
      <div className="card-name">
        <span className="card-name-text">
          {card.name}
          {upgraded ? ' +' : ''}
        </span>
        <span className="card-cost">{card.cost}</span>
      </div>
      <div className="card-art-window">
        <CardArtBackdrop type={card.type} />
        <div className="card-art-content">
          {CARD_ART[card.id] ? (
            <img className="card-art-img" src={CARD_ART[card.id]} alt="" draggable={false} />
          ) : sourceMonster ? (
            <MonsterArt speciesId={sourceMonster.speciesId} size={Math.round(width * 0.62)} />
          ) : (
            <span className="card-glyph">{card.emoji}</span>
          )}
        </div>
        {(card.rarity === 'uncommon' || card.rarity === 'rare') && <div className="card-art-sheen" />}
      </div>
      <div className="card-type-line">
        {TYPE_LABEL[card.type]}
        {sourceMonster ? ` · ${sourceMonster.nickname}` : ''}
        {card.exhaust ? ' · Exhaust' : ''}
      </div>
      <div className="card-text-plate">
        <div className="card-body">
          {numbers.length > 0 && (
            <div className={`card-numbers ${effectiveness ? `card-numbers-${effectiveness}` : ''}`}>{numbers.join('  ')}</div>
          )}
          <div className="card-text">{card.text}</div>
        </div>
      </div>
    </div>
  );
}
