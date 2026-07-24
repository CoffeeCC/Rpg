import type { GameAction, GameState } from '../engine/game';
import type { ItemV2 } from '../engine/types';
import { FAMILY_INFO } from '../engine/data/species';
import { getSkill } from '../engine/data/skills';
import { MonsterImage } from '../art/MonsterImage';
import { ItemLine } from './ItemLine';
import '../sheets.css';

// v17 (PLAN7 C3): companion sheet matching the hero's — portrait panel with
// HP/MP/EXP/bond bars on the left, attribute orbs + skills + accessory
// sockets on the right. Presentation only — the context-aware back button
// (expedition vs stable) and the EXP readout are preserved exactly.

const STAT_ORDER = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'] as const;

function AccessorySlot({
  label,
  slot,
  worn,
  bag,
  monsterUid,
  dispatch,
}: {
  label: string;
  slot: 'charm' | 'trinket';
  worn: ItemV2 | null;
  bag: ItemV2[];
  monsterUid: string;
  dispatch: (a: GameAction) => void;
}) {
  return (
    <div className={`accessory-slot ${worn ? 'filled' : ''}`}>
      <div className="accessory-head">
        <span className="accessory-label">🧿 {label}</span>
        {worn && (
          <button className="btn small danger" onClick={() => dispatch({ type: 'MONSTER_UNEQUIP', monsterUid, slot })}>
            Remove
          </button>
        )}
      </div>
      {worn ? (
        <ItemLine item={worn} iconSize={40} />
      ) : bag.length === 0 ? (
        <p className="subtitle" style={{ margin: 0 }}>
          No {label.toLowerCase()}s in your bag. Forge one at the Smith.
        </p>
      ) : (
        <div className="option-list">
          {bag.map((item) => (
            <div className="item-row" key={item.uid}>
              <div className="item-desc">
                <ItemLine item={item} iconSize={36} />
              </div>
              <button className="btn small" onClick={() => dispatch({ type: 'MONSTER_EQUIP', monsterUid, itemUid: item.uid })}>
                Fit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonsterSheetScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const monster = [...state.party, ...state.stable].find((m) => m.uid === state.selectedMonsterUid);
  // Mid-run this sheet must return to the floor — "Back to the Stable" from an
  // expedition walks away from the run entirely.
  const backScreen = state.expedition ? 'floor' : 'stable';
  const backLabel = state.expedition ? '← Back to the expedition' : 'Back to the Stable';
  if (!monster) {
    return (
      <div className="panel">
        <p className="subtitle">That companion is no longer with you.</p>
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          {backLabel}
        </button>
      </div>
    );
  }
  const p = monster.personality;
  const a = monster.aspect;
  const inParty = state.party.some((m) => m.uid === monster.uid);
  const charms = state.player!.items.filter((i) => i.slot === 'charm');
  const trinkets = state.player!.items.filter((i) => i.slot === 'trinket');

  const hpPct = Math.max(0, Math.min(100, Math.round((monster.hp / monster.maxHp) * 100)));
  const mpPct = monster.maxMp > 0 ? Math.max(0, Math.min(100, Math.round((monster.mp / monster.maxMp) * 100))) : 0;
  const expPct = Math.min(100, Math.round((monster.exp / monster.expToNext()) * 100));
  const bondPct = Math.min(100, Math.round((monster.bond / 25) * 100));
  const bondWord = monster.bond >= 25 ? '(devoted)' : monster.bond >= 10 ? '(loyal)' : '';

  return (
    <div className="panel monster-sheet">
      <h1 className="title">{monster.nickname}</h1>
      <p className="subtitle">
        {monster.species.name} · Lv {monster.level} {monster.plus > 0 ? `· +${monster.plus} (gen ${monster.plus})` : ''} ·{' '}
        {FAMILY_INFO[monster.family].emoji} {monster.family} · {inParty ? 'in your party' : 'in the stable'}
      </p>

      <div className="ms-layout">
        <aside className="sheet-figure-panel ms-side">
          <div className="figure-plinth">
            <MonsterImage speciesId={monster.speciesId} size={190} rarity={monster.rarity} />
          </div>
          <div className="ms-bars">
            <div className="ms-bar">
              <span className="ms-bar-label">HP</span>
              <div className="ms-bar-track">
                <div className="ms-bar-fill hp" style={{ width: `${hpPct}%` }} />
              </div>
              <span className="ms-bar-val">
                {monster.hp}/{monster.maxHp}
              </span>
            </div>
            <div className="ms-bar">
              <span className="ms-bar-label">MP</span>
              <div className="ms-bar-track">
                <div className="ms-bar-fill mp" style={{ width: `${mpPct}%` }} />
              </div>
              <span className="ms-bar-val">
                {monster.mp}/{monster.maxMp}
              </span>
            </div>
            <div className="ms-bar">
              <span className="ms-bar-label">EXP</span>
              <div className="ms-bar-track">
                <div className="ms-bar-fill exp" style={{ width: `${expPct}%` }} />
              </div>
              <span className="ms-bar-val">
                {monster.exp}/{monster.expToNext()}
              </span>
            </div>
            <div className="ms-bar" title="Battles survived at your side. Instincts strengthen with bond.">
              <span className="ms-bar-label">Bond</span>
              <div className="ms-bar-track">
                <div className="ms-bar-fill bond" style={{ width: `${bondPct}%` }} />
              </div>
              <span className="ms-bar-val">
                🤝 {monster.bond} {bondWord}
              </span>
            </div>
          </div>
        </aside>

        <div className="ms-main">
          {a && (
            <p className="affix-line ms-aspect" title={a.blurb}>
              ✶ <b>{a.name}</b> — {a.blurb}
            </p>
          )}
          {p && (
            <p className="affix-line ms-personality">
              <b className="personality-pill">{p.name}</b> — {p.blurb} <i>Instinct: {p.instinctText}</i>
            </p>
          )}

          <h2 className="sheet-section-title">Stats</h2>
          <div className="ms-orb-grid">
            {STAT_ORDER.map((s) => (
              <div className="attr-orb" key={s}>
                <span className="attr-orb-val">{monster.stats[s]}</span>
                <span className="attr-orb-name">{s}</span>
              </div>
            ))}
          </div>

          <h2 className="sheet-section-title">Skills</h2>
          {monster.knownSkills.length > 0 ? (
            <div className="ms-skills">
              {monster.knownSkills.map((id) => (
                <span className="ms-skill" key={id}>
                  {getSkill(id)?.name ?? id}
                </span>
              ))}
            </div>
          ) : (
            <p className="affix-line">No learned skills.</p>
          )}

          <h2 className="sheet-section-title">Accessories</h2>
          <div className="ms-acc-grid">
            <AccessorySlot label="Charm" slot="charm" worn={monster.charm} bag={charms} monsterUid={monster.uid} dispatch={dispatch} />
            <AccessorySlot label="Trinket" slot="trinket" worn={monster.trinket} bag={trinkets} monsterUid={monster.uid} dispatch={dispatch} />
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}
