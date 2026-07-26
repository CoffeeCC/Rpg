import { useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import { useNavScope, useRefocusOn } from '../nav';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { canBreed, offspringSpecies, skillPool, MIN_BREEDING_LEVEL } from '../engine/systems/breeding';
import { FAMILY_INFO } from '../engine/data/species';
import { getSkill } from '../engine/data/skills';
import { MonsterImage } from '../art/MonsterImage';
import { Icon } from './Icon';
import '../services.css';

/** One side of the ritual: a filled parent socket or a waiting hollow. */
function ParentSocket({ monster, label }: { monster: MonsterInstance | null; label: string }) {
  return (
    <div className={`breed-socket${monster ? ' filled' : ''}`}>
      <div className="breed-socket-frame">
        {monster ? (
          <MonsterImage speciesId={monster.speciesId} size={72} rarity={monster.rarity} />
        ) : (
          <span className="breed-socket-glyph dim">?</span>
        )}
      </div>
      {monster ? (
        <>
          <span className="breed-socket-name">
            {monster.nickname}
            {monster.plus > 0 ? ` +${monster.plus}` : ''}
          </span>
          <span className="breed-socket-label">Lv{monster.level} · {monster.family}</span>
        </>
      ) : (
        <span className="breed-socket-label">{label}</span>
      )}
    </div>
  );
}

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

  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'breeding',
    onCancel: () => {
      // B undoes the selection before it leaves the room. Picking parents is a
      // stateful two-step with no visible cursor to say where you are in it,
      // and "get me out of this half-made choice" is what cancel means here.
      if (parentB) {
        setParentB(null);
        setChosenSkills([]);
        return true;
      }
      if (parentA) {
        setParentA(null);
        setChosenSkills([]);
        return true;
      }
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  // The skill chips and the Breed button exist only while a valid pair stands.
  // Breeding unmounts the button the cursor is sitting on.
  useRefocusOn([!!preview]);

  return (
    <div className="panel" ref={root}>
      <h1 className="title title-with-icon"><Icon name="breeding" size={26} emoji="" /> Breeding Lab</h1>
      <NpcHost npcId="ott" state={state} />
      <p className="subtitle">
        Pick two tamed monsters (level {MIN_BREEDING_LEVEL}+). Both are given to the egg - the offspring inherits their strength, a +generation growth
        boost, and up to 3 skills you choose.
      </p>

      <div className="breed-ritual">
        <ParentSocket monster={a} label="First parent" />
        <span className="breed-heart" aria-hidden>
          ♥
        </span>
        <ParentSocket monster={b} label="Second parent" />
        <span className="breed-arrow" aria-hidden>
          ➤
        </span>
        <div className={`breed-socket breed-result${preview ? ' filled' : ''}`}>
          <div className="breed-socket-frame">
            <span className={`breed-socket-glyph${preview ? '' : ' dim'}`}>{preview ? preview.emoji : '🥚'}</span>
          </div>
          {preview ? (
            <>
              <span className="breed-socket-name">{preview.name}</span>
              <span className="breed-socket-label">
                {preview.family} · tier {preview.tier}
              </span>
            </>
          ) : (
            <span className="breed-socket-label">Offspring</span>
          )}
        </div>
      </div>

      {a && b && pairCheck && !pairCheck.ok && <p className="breed-reason">⚠️ {pairCheck.reason}</p>}

      <div className="option-list breed-pick">
        {owned.length < 2 && (
          <div className="empty-state">
            <span className="empty-glyph">🥚</span>
            <span>You need at least two monsters. Go tame something!</span>
          </div>
        )}
        {owned.map((m) => {
          const selected = m.uid === parentA || m.uid === parentB;
          return (
            <button type="button" key={m.uid} className={`option-card ${selected ? 'selected' : ''}`} onClick={() => toggleParent(m.uid)}>
              <span className="breed-thumb">
                <MonsterImage speciesId={m.speciesId} size={48} rarity={m.rarity} />
              </span>
              <div className="option-card-body">
                <div className="name">
                  {m.nickname}
                  {m.plus > 0 ? ` +${m.plus}` : ''} <span className="pill">Lv{m.level}</span>
                  <span className="pill">
                    <Icon name={`family_${m.family.toLowerCase()}`} emoji={FAMILY_INFO[m.family].emoji} size={14} /> {m.family}
                  </span>
                  {m.level < MIN_BREEDING_LEVEL && <span className="pill">too young</span>}
                  {selected && <span className="pill breed-chosen-pill">parent</span>}
                </div>
                <div className="desc">{m.knownSkills.map((id) => getSkill(id)?.name ?? id).join(', ') || 'no skills'}</div>
              </div>
            </button>
          );
        })}
      </div>

      {preview && (
        <div className="breed-outcome">
          <p className="subtitle" style={{ margin: '0 0 8px' }}>{preview.description}</p>
          <p className="subtitle" style={{ margin: '0 0 6px' }}>Choose up to 3 skills ({chosenSkills.length}/3):</p>
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
