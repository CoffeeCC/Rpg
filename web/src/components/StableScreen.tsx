import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import { COVENANT_INTRO, OTT_COVENANT_LINES } from '../engine/data/covenantLore';
import { STABLE_CAP } from '../engine/game';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { FAMILY_INFO } from '../engine/data/species';
import { MonsterImage } from '../art/MonsterImage';
import { Icon } from './Icon';
import '../services.css';

function MonsterCard({ monster, actions, onView }: { monster: MonsterInstance; actions: React.ReactNode; onView: () => void }) {
  const p = monster.personality;
  return (
    <div className="stable-card">
      <button className="stable-card-portrait" onClick={onView} title="Open character sheet">
        <MonsterImage speciesId={monster.speciesId} size={88} rarity={monster.rarity} />
      </button>
      <div className="stable-card-name">
        {monster.nickname}
        {monster.plus > 0 && <span className="pill">+{monster.plus}</span>}
      </div>
      <div className="stable-card-pills">
        <span className="pill">Lv{monster.level}</span>
        <span className="pill">
          {FAMILY_INFO[monster.family].emoji} {monster.family}
        </span>
        {p && (
          <span className="pill personality-pill" title={`${p.blurb} Instinct: ${p.instinctText}`}>
            {p.name}
          </span>
        )}
        <span className="pill" title="Bond grows with every battle survived.">
          🤝 {monster.bond}
        </span>
      </div>
      <div className="affix-line stable-card-stats">
        HP {monster.hp}/{monster.maxHp} · STR {monster.stats.STR} DEF {monster.stats.DEF} DEX {monster.stats.DEX} INT {monster.stats.INT}
        {(monster.charm || monster.trinket) && <span> · 🧿 {[monster.charm, monster.trinket].filter(Boolean).length} worn</span>}
      </div>
      <div className="stable-card-actions">
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
      <p className="subtitle">Click a companion to open its page.</p>

      <h2 className="svc-section">
        Active Party <span className="pill">{state.party.length}/{state.player!.traits.partyCap}</span>
      </h2>
      <div className="option-list stable-grid">
        {state.party.length === 0 && (
          <div className="empty-state">
            <span className="empty-glyph">🐾</span>
            <span>No companions walk beside you yet.</span>
            <span style={{ fontSize: '0.82rem' }}>Weaken a wild monster in battle, then play Reach Out to tame it.</span>
          </div>
        )}
        {state.party.map((m) => (
          <MonsterCard
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

      <h2 className="svc-section">
        In the Stable <span className="pill">{state.stable.length}/{STABLE_CAP}</span>
      </h2>
      <div className="option-list stable-grid">
        {state.stable.length === 0 && (
          <div className="empty-state">
            <span className="empty-glyph">🏚️</span>
            <span>Empty stalls, waiting on you, tamer.</span>
          </div>
        )}
        {state.stable.map((m) => (
          <MonsterCard
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
