import { useLayoutEffect, useRef, useState } from 'react';
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

// Card names are hand-written and vary a lot in length ('Ashes to Feathers'
// vs 'A Vicious Reforming of Features') while the name bar's width scales
// with the card's rendered size, so a fixed font-size either wastes space on
// short names or truncates long ones. Measuring actual overflow beats a
// character-count guess since it accounts for the real font metrics, the
// cost gem's width, and every width this component gets rendered at (128 in
// the smith, 300 in the detail overlay, etc).
const NAME_BASE_FONT_REM = 0.7;
// Low enough that even the game's longest name ('A Vicious Reforming of
// Features', 31 chars) fits at every width the game actually renders cards
// at except the smallest (128px, the smith's upgrade-preview slot) — verified
// against the built app, not just guessed from character count.
const NAME_MIN_FONT_SCALE = 0.45;

function useFitNameFontScale(text: string, width: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s = 1;
    el.style.fontSize = `${NAME_BASE_FONT_REM}rem`;
    while (el.scrollWidth > el.clientWidth + 1 && s > NAME_MIN_FONT_SCALE) {
      s = Math.max(NAME_MIN_FONT_SCALE, s - 0.05);
      el.style.fontSize = `${(s * NAME_BASE_FONT_REM).toFixed(3)}rem`;
    }
    setScale(s);
  }, [text, width]);

  return { ref, scale };
}

export function CardView({ card, hero, sourceMonster, width = 216, playable = true, selected = false, upgraded = false, previewTarget }: CardViewProps) {
  const height = Math.round(width * 1.4);
  const numbers = cardNumbers(card, hero, sourceMonster, upgraded, previewTarget);
  const effectiveness = cardEffectiveness(card, previewTarget);
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const tiltable = card.rarity === 'rare';
  const nameText = `${card.name}${upgraded ? ' +' : ''}`;
  const { ref: nameRef, scale: nameFontScale } = useFitNameFontScale(nameText, width);

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
      <span className="card-cost">{card.cost}</span>
      <div className="card-name">
        <span ref={nameRef} className="card-name-text" style={{ fontSize: `${(nameFontScale * NAME_BASE_FONT_REM).toFixed(3)}rem` }}>
          {nameText}
        </span>
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
