import { useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import { useNavScope } from '../nav';
import { COVENANT_INTRO, OTT_COVENANT_LINES } from '../engine/data/covenantLore';
import { STABLE_CAP } from '../engine/game';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { FAMILY_INFO } from '../engine/data/species';
import { MonsterImage } from '../art/MonsterImage';
import { Icon } from './Icon';
import { useConfirmAction } from './ConfirmOverlay';
import '../services.css';

function MonsterCard({
  monster,
  actions,
  onView,
  initial,
}: {
  monster: MonsterInstance;
  actions: React.ReactNode;
  onView: () => void;
  initial?: boolean;
}) {
  const p = monster.personality;
  return (
    <div className="stable-card">
      {/* The portrait and "View ▸" below fire the same thing. On a mouse that
          redundancy is a convenience; on a D-pad walking twenty stalls it is
          twenty extra presses to no end, so the portrait is out of the ring
          (data-nav-skip for the pad, tabIndex -1 for Tab) and stays clickable. */}
      <button className="stable-card-portrait" data-nav-skip="" tabIndex={-1} onClick={onView} title="Open character sheet">
        <MonsterImage speciesId={monster.speciesId} size={88} rarity={monster.rarity} />
      </button>
      <div className="stable-card-name">
        {monster.nickname}
        {monster.plus > 0 && <span className="pill">+{monster.plus}</span>}
      </div>
      <div className="stable-card-pills">
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
      </div>
      <div className="affix-line stable-card-stats">
        HP {monster.hp}/{monster.maxHp} · STR {monster.stats.STR} DEF {monster.stats.DEF} DEX {monster.stats.DEX} INT {monster.stats.INT}
        {(monster.charm || monster.trinket) && <span> · 🧿 {[monster.charm, monster.trinket].filter(Boolean).length} worn</span>}
      </div>
      <div className="stable-card-actions">
        <button className="btn small" onClick={onView} data-nav-initial={initial ? '' : undefined} aria-label={`View ${monster.nickname}`}>
          View ▸
        </button>
        {actions}
      </div>
    </div>
  );
}

export function StableScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  // Release is directly right of "To party" (CONTROLLER_AUDIT.md C5). One
  // over-travelled D-pad press and a tamed monster is gone for good.
  const guard = useConfirmAction();
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'stable',
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  // Where the cursor opens: the first companion actually walking with you, or
  // failing that the first one in the stalls. Otherwise the first candidate in
  // document order is the Covenant disclosure, which is prose, not an action.
  const firstPartyUid = state.party[0]?.uid;
  const firstStableUid = state.stable[0]?.uid;
  return (
    <div className="panel" ref={root}>
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
            initial={m.uid === firstPartyUid}
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
            initial={!firstPartyUid && m.uid === firstStableUid}
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
                <button
                  className="btn small danger"
                  onClick={() =>
                    guard.ask({
                      title: `Release ${m.nickname}?`,
                      detail: `${m.nickname} walks back into the dusk and does not come back. Everything it learned goes with it. This cannot be undone.`,
                      confirmLabel: 'Release',
                      perform: () => dispatch({ type: 'RELEASE', uid: m.uid }),
                    })
                  }
                >
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
      {guard.overlay}
    </div>
  );
}
