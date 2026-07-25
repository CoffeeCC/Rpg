import type { Character } from '../engine/entities/Character';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import type { GameAction } from '../engine/game';
import { FAMILY_INFO } from '../engine/data/species';
import { SPECIES_CARDS } from '../engine/data/cards';
import { MonsterArt } from '../art/monsterArt';
import { HeroArt } from '../art/heroArt';
import { Bar } from './Bars';
import { Icon } from './Icon';
import '../charsheet.css';

// v20: the roster down the right-hand side is now a way in. Each card is a
// real button — focusable, operable from the keyboard, announced properly —
// that opens the sheet of whoever it names. The sheets themselves handle
// getting you back out.

function StatusTags({ entity }: { entity: Character | MonsterInstance }) {
  if (entity.statusEffects.length === 0 && entity.activeMods.length === 0) return null;
  return (
    <div className="status-tags">
      {entity.statusEffects.map((s) => (
        <span key={s.name} className="status-tag">
          {s.name}
        </span>
      ))}
      {entity.activeMods.map((m, i) => (
        <span key={i} className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}>
          {m.stat}
          {m.amount > 0 ? '↑' : '↓'}
        </span>
      ))}
    </div>
  );
}

export function PartySidebar({ hero, party, dispatch }: { hero: Character; party: MonsterInstance[]; dispatch: (a: GameAction) => void }) {
  return (
    <>
      <button
        type="button"
        className={`party-card psb-card ${hero.isAlive() ? '' : 'dead'}`}
        onClick={() => dispatch({ type: 'GOTO', screen: 'characterSheet' })}
        aria-label={`Open ${hero.name}'s character sheet`}
        title={`${hero.name} — open the character sheet`}
      >
        <div className="who">
          <span className="name">
            <span className="portrait">
              <HeroArt className={hero.className} size={30} />
            </span>{' '}
            {hero.name}
          </span>
          <span className="level-badge">Lv {hero.level}</span>
        </div>
        <Bar label="HP" current={hero.hp} max={hero.maxHp} kind="hp" />
        <StatusTags entity={hero} />
        <span className="psb-hint" aria-hidden="true">
          Character sheet ▸
        </span>
      </button>
      {party.map((m) => (
        <button
          type="button"
          key={m.uid}
          className={`party-card psb-card ${m.isAlive() ? '' : 'dead'}`}
          onClick={() => dispatch({ type: 'OPEN_MONSTER', uid: m.uid })}
          aria-label={`Open ${m.nickname}'s sheet`}
          title={`${m.nickname} — open their sheet`}
        >
          <div className="who">
            <span className="name">
              <span className="portrait">
                <MonsterArt speciesId={m.speciesId} size={30} />
              </span>{' '}
              {m.nickname}
              {m.plus > 0 ? ` +${m.plus}` : ''}
            </span>
            <span className="level-badge">Lv {m.level}</span>
          </div>
          <div className="affix-line">
            {m.species.name} · <Icon name={`family_${m.family.toLowerCase()}`} emoji={FAMILY_INFO[m.family].emoji} size={14} /> {m.family} ·{' '}
            {(SPECIES_CARDS[m.speciesId] ?? []).length} card
            {(SPECIES_CARDS[m.speciesId] ?? []).length === 1 ? '' : 's'}
          </div>
          <Bar label="HP" current={m.hp} max={m.maxHp} kind="hp" />
          <StatusTags entity={m} />
          <span className="psb-hint" aria-hidden="true">
            Companion sheet ▸
          </span>
        </button>
      ))}
      {party.length === 0 && (
        <div className="party-card">
          <span className="affix-line">No monsters yet. Weaken one in battle and Tame it!</span>
        </div>
      )}
    </>
  );
}
