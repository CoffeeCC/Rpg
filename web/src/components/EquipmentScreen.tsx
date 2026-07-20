import { useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { ItemV2 } from '../engine/types';
import type { EquipKey } from '../engine/entities/Character';
import { ItemLine } from './ItemLine';

const SLOTS: EquipKey[] = ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring', 'ring2', 'amulet', 'pendant'];
const SLOT_LABEL: Record<EquipKey, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  headpiece: 'Headpiece',
  gloves: 'Gloves',
  boots: 'Boots',
  ring: 'Ring',
  ring2: 'Ring II',
  amulet: 'Amulet',
  pendant: 'Pendant',
};

interface Metric {
  label: string;
  now: number;
  after: number;
}

export function EquipmentScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [compareUid, setCompareUid] = useState<string | null>(null);

  /** PoE-style: equip on a throwaway clone and diff the numbers that matter. */
  function metricsFor(item: ItemV2): { metrics: Metric[]; replaces: ItemV2 | null } {
    const ghost = player.clone();
    const replaces = ghost.equip({ ...item, affixes: item.affixes.map((a) => ({ ...a })) });
    const metrics: Metric[] = [
      { label: 'Attack', now: player.getAttack(), after: ghost.getAttack() },
      { label: 'Magic', now: player.getMagicPower(), after: ghost.getMagicPower() },
      { label: 'Defense', now: player.getDefense(), after: ghost.getDefense() },
      { label: 'M.Def', now: player.getMagicDefense(), after: ghost.getMagicDefense() },
      { label: 'Max HP', now: player.maxHp, after: ghost.maxHp },
      { label: 'Max MP', now: player.maxMp, after: ghost.maxMp },
    ];
    return { metrics, replaces };
  }

  const comparing = compareUid ? player.items.find((i) => i.uid === compareUid) ?? null : null;
  const comparison = comparing && comparing.slot !== 'charm' ? metricsFor(comparing) : null;

  return (
    <div className="panel">
      <h1 className="title">🎒 Equipment</h1>
      <p className="subtitle">
        Attack {player.getAttack()} · Magic {player.getMagicPower()} · Defense {player.getDefense()} · M.Def {player.getMagicDefense()} · HP{' '}
        {player.maxHp}
      </p>

      <div className="equip-grid">
        {SLOTS.map((slot) => {
          const item = player.equipment[slot];
          return (
            <div className="stat-row" key={slot}>
              <span style={{ color: 'var(--text-dim)' }}>{SLOT_LABEL[slot]}</span>
              <span>{item ? <ItemLine item={item} showAffixes={false} /> : '—'}</span>
            </div>
          );
        })}
      </div>

      {comparing && comparison && (
        <div className="compare-panel">
          <div className="compare-head">
            <b>
              <ItemLine item={comparing} />
            </b>
            {comparison.replaces && (
              <span className="subtitle">
                replaces <ItemLine item={comparison.replaces} showAffixes={false} />
              </span>
            )}
          </div>
          <div className="compare-metrics">
            {comparison.metrics.map((m) => {
              const delta = m.after - m.now;
              return (
                <span key={m.label} className={`compare-metric ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
                  {m.label} {m.now} → {m.after}
                  {delta !== 0 && <b> ({delta > 0 ? '+' : ''}{delta})</b>}
                </span>
              );
            })}
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn small primary" onClick={() => dispatch({ type: 'EQUIP', uid: comparing.uid })}>
              Equip it
            </button>
            <button className="btn small" onClick={() => setCompareUid(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <h2 className="title" style={{ fontSize: '1rem', marginTop: 14 }}>
        Bag ({player.items.length})
      </h2>
      <div className="option-list">
        {player.items.length === 0 && <p className="subtitle">Empty. Monsters and chests drop gear.</p>}
        {player.items.map((item) => (
          <div
            className={`item-row ${compareUid === item.uid ? 'selected' : ''}`}
            key={item.uid}
            onMouseEnter={() => item.slot !== 'charm' && setCompareUid(item.uid)}
          >
            <div className="item-desc">
              <ItemLine item={item} />
              {item.slot === 'charm' && <span className="pill">monster charm — fit it at the Stable</span>}
            </div>
            {item.slot !== 'charm' && (
              <button className="btn small" onClick={() => dispatch({ type: 'EQUIP', uid: item.uid })}>
                Equip
              </button>
            )}
            <button className="btn small danger" onClick={() => dispatch({ type: 'SELL_GEAR', uid: item.uid })}>
              Sell
            </button>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
