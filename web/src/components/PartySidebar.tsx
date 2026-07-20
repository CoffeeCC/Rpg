import type { Character } from '../engine/entities/Character';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { FAMILY_INFO } from '../engine/data/species';
import { SPECIES_CARDS } from '../engine/data/cards';
import { MonsterArt } from '../art/monsterArt';
import { HeroArt } from '../art/heroArt';
import { Bar } from './Bars';

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

export function PartySidebar({ hero, party }: { hero: Character; party: MonsterInstance[] }) {
  return (
    <>
      <div className={`party-card ${hero.isAlive() ? '' : 'dead'}`}>
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
      </div>
      {party.map((m) => (
        <div key={m.uid} className={`party-card ${m.isAlive() ? '' : 'dead'}`}>
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
            {m.species.name} · {FAMILY_INFO[m.family].emoji} {m.family} · {(SPECIES_CARDS[m.speciesId] ?? []).length} card
            {(SPECIES_CARDS[m.speciesId] ?? []).length === 1 ? '' : 's'}
          </div>
          <Bar label="HP" current={m.hp} max={m.maxHp} kind="hp" />
          <StatusTags entity={m} />
        </div>
      ))}
      {party.length === 0 && <div className="party-card"><span className="affix-line">No monsters yet. Weaken one in battle and Tame it!</span></div>}
    </>
  );
}
