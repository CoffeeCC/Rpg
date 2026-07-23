import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import { COVENANT_INTRO, OTT_COVENANT_LINES } from '../engine/data/covenantLore';
import { STABLE_CAP } from '../engine/game';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { FAMILY_INFO } from '../engine/data/species';
import { MonsterImage } from '../art/MonsterImage';
import { Icon } from './Icon';

function MonsterRow({ monster, actions, onView }: { monster: MonsterInstance; actions: React.ReactNode; onView: () => void }) {
  const p = monster.personality;
  return (
    <div className="item-row monster-row">
      <button className="monster-row-view" onClick={onView} title="Open character sheet">
        <MonsterImage speciesId={monster.speciesId} size={54} rarity={monster.rarity} />
      </button>
      <div className="item-desc" style={{ flex: 1 }}>
        <b>{monster.nickname}</b>
        {monster.plus > 0 && <span className="pill">+{monster.plus}</span>}
        <span className="pill">Lv{monster.level}</span>
        <span className="pill">
          <Icon name={`family_${monster.family.toLowerCase()}`} emoji={FAMILY_INFO[monster.family].emoji} size={14} /> {monster.family}
        </span>
        {p && (
          <span className="pill personality-pill" title={`${p.blurb} Instinct: ${p.instinctText}`}>
            {p.name}
          </span>
        )}
        <span className="pill" title="Bond grows with every battle survived.">
          🤝 {monster.bond}
        </span>
        <div className="affix-line">
          HP {monster.hp}/{monster.maxHp} · STR {monster.stats.STR} DEF {monster.stats.DEF} DEX {monster.stats.DEX} INT {monster.stats.INT}
          {(monster.charm || monster.trinket) && <span> · 🧿 {[monster.charm, monster.trinket].filter(Boolean).length} worn</span>}
        </div>
      </div>
      <div className="monster-row-actions">
        <button className="btn small" onClick={onView}>
          View ▸
        </button>
        {actions}
      </div>
    </div>
  );
}

export function StableScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  return (
    <div className="panel">
      <h1 className="title title-with-icon"><Icon name="stable" size={26} emoji="" /> The Stable</h1>
      <NpcHost npcId="ott" state={state} />
      <details className="covenant-panel">
        <summary>📜 The Covenant of Names — why we tame</summary>
        {COVENANT_INTRO.map((p, i) => (
          <p className="covenant-text" key={i}>{p}</p>
        ))}
        <p className="covenant-text covenant-ott">“{OTT_COVENANT_LINES[(state.party.length + state.stable.length) % OTT_COVENANT_LINES.length]}” — Ott</p>
      </details>
      <p className="subtitle">
        Active party {state.party.length}/{state.player!.traits.partyCap} · Stable {state.stable.length}/{STABLE_CAP} · click a companion to open its page
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
            onView={() => dispatch({ type: 'OPEN_MONSTER', uid: m.uid })}
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
            onView={() => dispatch({ type: 'OPEN_MONSTER', uid: m.uid })}
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
