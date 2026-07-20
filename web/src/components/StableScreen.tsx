import type { GameAction, GameState } from '../engine/game';
import { STABLE_CAP } from '../engine/game';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { FAMILY_INFO } from '../engine/data/species';
import { getSkill } from '../engine/data/skills';
import { ItemLine } from './ItemLine';

function MonsterRow({ monster, charms, onCharm, actions }: { monster: MonsterInstance; charms: { uid: string; name: string }[]; onCharm: (itemUid: string) => void; actions: React.ReactNode }) {
  const p = monster.personality;
  return (
    <div className="item-row">
      <div className="item-desc">
        {monster.species.emoji} <b>{monster.nickname}</b>
        {monster.plus > 0 && <span className="pill">+{monster.plus}</span>}
        <span className="pill">Lv{monster.level}</span>
        <span className="pill">
          {FAMILY_INFO[monster.family].emoji} {monster.family}
        </span>
        {p && (
          <span className="pill personality-pill" title={`${p.blurb} Instinct: ${p.instinctText}`}>
            {p.name}
          </span>
        )}
        <span className="pill" title="Bond grows with every battle survived. Instincts strengthen at 10 and 25.">
          🤝 {monster.bond}
        </span>
        <div className="affix-line">
          {monster.species.name} · HP {monster.hp}/{monster.maxHp} · STR {monster.stats.STR} DEF {monster.stats.DEF} DEX {monster.stats.DEX} INT{' '}
          {monster.stats.INT} · {monster.knownSkills.map((id) => getSkill(id)?.name ?? id).join(', ') || 'no skills'}
        </div>
        <div className="affix-line">
          🧿 {monster.charm ? <ItemLine item={monster.charm} /> : 'no charm'}
          {charms.map((c) => (
            <button key={c.uid} className="btn small" style={{ marginLeft: 6 }} onClick={() => onCharm(c.uid)}>
              fit {c.name}
            </button>
          ))}
        </div>
      </div>
      {actions}
    </div>
  );
}

export function StableScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const charms = state.player!.items.filter((i) => i.slot === 'charm').map((i) => ({ uid: i.uid, name: i.name }));
  return (
    <div className="panel">
      <h1 className="title">🐴 The Stable</h1>
      <p className="subtitle">
        Active party {state.party.length}/{state.player!.traits.partyCap} · Stable {state.stable.length}/{STABLE_CAP}
      </p>

      <h2 className="title" style={{ fontSize: '1rem' }}>
        Active Party
      </h2>
      <div className="option-list">
        {state.party.length === 0 && <p className="subtitle">No monsters in the party.</p>}
        {state.party.map((m) => (
          <MonsterRow
            key={m.uid}
            monster={m}
            charms={charms}
            onCharm={(itemUid) => dispatch({ type: 'MONSTER_CHARM', monsterUid: m.uid, itemUid })}
            actions={
              <button className="btn small" onClick={() => dispatch({ type: 'PARTY_REMOVE', uid: m.uid })}>
                To stable
              </button>
            }
          />
        ))}
      </div>

      <h2 className="title" style={{ fontSize: '1rem', marginTop: 14 }}>
        In the Stable
      </h2>
      <div className="option-list">
        {state.stable.length === 0 && <p className="subtitle">The stable is empty.</p>}
        {state.stable.map((m) => (
          <MonsterRow
            key={m.uid}
            monster={m}
            charms={charms}
            onCharm={(itemUid) => dispatch({ type: 'MONSTER_CHARM', monsterUid: m.uid, itemUid })}
            actions={
              <>
                <button
                  className="btn small"
                  disabled={state.party.length >= state.player!.traits.partyCap}
                  onClick={() => dispatch({ type: 'PARTY_ADD', uid: m.uid })}
                >
                  To party
                </button>
                <button className="btn small danger" onClick={() => dispatch({ type: 'RELEASE', uid: m.uid })}>
                  Release
                </button>
              </>
            }
          />
        ))}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
    </div>
  );
}
