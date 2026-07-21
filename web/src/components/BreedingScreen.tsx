import { useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { canBreed, offspringSpecies, skillPool, MIN_BREEDING_LEVEL } from '../engine/systems/breeding';
import { FAMILY_INFO } from '../engine/data/species';
import { getSkill } from '../engine/data/skills';
import { Icon } from './Icon';

export function BreedingScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [parentA, setParentA] = useState<string | null>(null);
  const [parentB, setParentB] = useState<string | null>(null);
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);

  const owned: MonsterInstance[] = [...state.party, ...state.stable];
  const a = owned.find((m) => m.uid === parentA) ?? null;
  const b = owned.find((m) => m.uid === parentB) ?? null;
  const pairCheck = a && b ? canBreed(a, b) : null;
  const preview = a && b && pairCheck?.ok ? offspringSpecies(a, b) : null;
  const pool = a && b && pairCheck?.ok ? skillPool(a, b) : [];

  function toggleParent(uid: string) {
    setChosenSkills([]);
    if (parentA === uid) setParentA(null);
    else if (parentB === uid) setParentB(null);
    else if (!parentA) setParentA(uid);
    else if (!parentB) setParentB(uid);
    else setParentB(uid);
  }

  function toggleSkill(id: string) {
    setChosenSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 3 ? [...prev, id] : prev));
  }

  function doBreed() {
    if (!a || !b) return;
    dispatch({ type: 'BREED', parentA: a.uid, parentB: b.uid, skillIds: chosenSkills });
    setParentA(null);
    setParentB(null);
    setChosenSkills([]);
  }

  return (
    <div className="panel">
      <h1 className="title title-with-icon"><Icon name="breeding" size={26} emoji="" /> Breeding Lab</h1>
      <NpcHost npcId="ott" state={state} />
      <p className="subtitle">
        Pick two tamed monsters (level {MIN_BREEDING_LEVEL}+). Both are given to the egg - the offspring inherits their strength, a +generation growth
        boost, and up to 3 skills you choose.
      </p>

      <div className="option-list">
        {owned.length < 2 && <p className="subtitle">You need at least two monsters. Go tame something!</p>}
        {owned.map((m) => {
          const selected = m.uid === parentA || m.uid === parentB;
          return (
            <button type="button" key={m.uid} className={`option-card ${selected ? 'selected' : ''}`} onClick={() => toggleParent(m.uid)}>
              <div className="name">
                {m.species.emoji} {m.nickname}
                {m.plus > 0 ? ` +${m.plus}` : ''} <span className="pill">Lv{m.level}</span>
                <span className="pill">
                  {FAMILY_INFO[m.family].emoji} {m.family}
                </span>
                {m.level < MIN_BREEDING_LEVEL && <span className="pill">too young</span>}
              </div>
              <div className="desc">{m.knownSkills.map((id) => getSkill(id)?.name ?? id).join(', ') || 'no skills'}</div>
            </button>
          );
        })}
      </div>

      {a && b && pairCheck && !pairCheck.ok && <p className="subtitle" style={{ marginTop: 10 }}>⚠️ {pairCheck.reason}</p>}

      {preview && (
        <div style={{ marginTop: 12 }}>
          <h2 className="title" style={{ fontSize: '1rem' }}>
            Offspring: {preview.emoji} {preview.name} <span className="pill">{preview.family} · tier {preview.tier}</span>
          </h2>
          <p className="subtitle">{preview.description}</p>
          <p className="subtitle">Choose up to 3 skills ({chosenSkills.length}/3):</p>
          <div className="btn-row">
            {pool.map((id) => {
              const skill = getSkill(id);
              if (!skill) return null;
              return (
                <button key={id} className={`btn small ${chosenSkills.includes(id) ? 'primary' : ''}`} onClick={() => toggleSkill(id)}>
                  {skill.emoji} {skill.name}
                </button>
              );
            })}
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={chosenSkills.length === 0} onClick={doBreed}>
              🥚 Breed them
            </button>
          </div>
        </div>
      )}

      <div className="btn-row">
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
    </div>
  );
}
