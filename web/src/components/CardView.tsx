import type { CardDef } from '../engine/types';
import type { Character } from '../engine/entities/Character';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { cardNumbers } from '../engine/systems/cardBattle';
import { CardOrnament, CardArtBackdrop } from '../art/cardFrames';
import { MonsterArt } from '../art/monsterArt';

export interface CardViewProps {
  card: CardDef;
  hero: Character;
  sourceMonster?: MonsterInstance;
  /** Rendered width in px (height follows the 5:7 card ratio). */
  width?: number;
  playable?: boolean;
  selected?: boolean;
  upgraded?: boolean;
}

const TYPE_LABEL: Record<CardDef['type'], string> = {
  strike: 'Strike',
  spell: 'Spell',
  guard: 'Guard',
  tactic: 'Tactic',
  summon: 'Summon',
};

export function CardView({ card, hero, sourceMonster, width = 148, playable = true, selected = false, upgraded = false }: CardViewProps) {
  const height = Math.round(width * 1.4);
  const numbers = cardNumbers(card, hero, sourceMonster, upgraded);
  return (
    <div
      className={`playing-card type-${card.type} rarity-card-${card.rarity} ${selected ? 'selected' : ''} ${playable ? '' : 'unplayable'} ${upgraded ? 'upgraded' : ''}`}
      style={{ width, height }}
    >
      <div className="card-art-window">
        <CardArtBackdrop type={card.type} />
        <div className="card-art-content">
          {sourceMonster ? <MonsterArt speciesId={sourceMonster.speciesId} size={Math.round(width * 0.62)} /> : <span className="card-glyph">{card.emoji}</span>}
        </div>
      </div>
      <div className="card-cost">{card.cost}</div>
      <div className="card-name">
        {card.name}
        {upgraded ? ' +' : ''}
      </div>
      <div className="card-type-line">
        {TYPE_LABEL[card.type]}
        {sourceMonster ? ` · ${sourceMonster.nickname}` : ''}
        {card.exhaust ? ' · Exhaust' : ''}
      </div>
      <div className="card-body">
        {numbers.length > 0 && <div className="card-numbers">{numbers.join('  ')}</div>}
        <div className="card-text">{card.text}</div>
      </div>
      <CardOrnament type={card.type} rarity={card.rarity} />
    </div>
  );
}
