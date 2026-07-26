import { useRef } from 'react';
import type { Character } from '../engine/entities/Character';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import type { CardDef } from '../engine/types';
import { describeEffect } from '../engine/systems/cardBattle';
import { CardView } from './CardView';
import { KeywordText } from './KeywordText';
import { useNavScope } from '../nav';
import { play as sfx } from '../platform/sfx';

const TARGET_LABEL: Record<CardDef['target'], string> = {
  enemy: 'Single enemy',
  allEnemies: 'All enemies',
  randomEnemy: 'Random enemy',
  self: 'Yourself',
  none: 'No target',
};

export function CardDetailOverlay({
  card,
  hero,
  sourceMonster,
  count,
  upgraded,
  onClose,
}: {
  card: CardDef;
  hero: Character;
  sourceMonster?: MonsterInstance;
  count: number;
  upgraded: boolean;
  onClose: () => void;
}) {
  // This overlay's own `window` keydown listener for Escape is gone: the nav
  // scope below handles B and Escape on the same code path, and keeping both
  // meant Escape closed it twice. Click-outside-to-close is unchanged.
  //
  // Note the trap. It matters more here than anywhere: the card grid behind
  // this thing is 40–200 buttons, and without a trap the cursor could walk
  // straight out of the open card and keep browsing underneath it.
  const overlayRef = useRef<HTMLDivElement>(null);
  useNavScope(overlayRef, {
    id: 'cardDetail',
    layer: 10,
    trap: true,
    onCancel: () => {
      onClose();
      return true;
    },
  });

  return (
    <div className="overlay card-inspect-overlay" ref={overlayRef} onClick={onClose}>
      <div className="panel card-inspect-panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn small card-inspect-close"
          onClick={() => {
            sfx('uiClick');
            onClose();
          }}
        >
          ✕
        </button>
        <div className="card-inspect-body">
          <div className="card-inspect-face">
            <CardView card={card} hero={hero} sourceMonster={sourceMonster} width={300} upgraded={upgraded} />
          </div>
          <div className="card-inspect-details">
            <h2 className="title" style={{ fontSize: '1.3rem' }}>
              {card.name}
              {upgraded ? ' +' : ''}
            </h2>
            <p className="subtitle">
              {card.type[0].toUpperCase() + card.type.slice(1)} · {card.rarity} · {card.cost} energy
              {count > 1 ? ` · ×${count} copies` : ''}
            </p>
            <p className="subtitle">
              Targets: {TARGET_LABEL[card.target]}
              {card.exhaust && (
                <>
                  {' · '}
                  <KeywordText text="Exhaust" />
                </>
              )}
              {sourceMonster ? ` · from ${sourceMonster.nickname}` : ''}
            </p>
            <ul className="card-inspect-effects">
              {card.effects.map((effect, i) => (
                <li key={i}>
                  <KeywordText text={describeEffect(effect, hero, sourceMonster, upgraded)} />
                </li>
              ))}
            </ul>
            {card.flavor && <p className="card-inspect-flavor">"{card.flavor}"</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
