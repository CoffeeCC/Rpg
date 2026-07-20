import type { GameAction, GameState, Screen } from '../engine/game';
import type { EquipmentSlot } from '../engine/types';
import { ItemLine } from './ItemLine';

const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring'];

export function EquipmentScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  return (
    <div className="panel">
      <h1 className="title">🎒 Equipment</h1>
      <p className="subtitle">
        Attack {player.getAttack()} · Magic {player.getMagicPower()} · Defense {player.getDefense()} · HP {player.maxHp} · MP {player.maxMp}
      </p>

      {SLOTS.map((slot) => {
        const item = player.equipment[slot];
        return (
          <div className="stat-row" key={slot}>
            <span style={{ textTransform: 'capitalize', color: 'var(--text-dim)' }}>{slot}</span>
            <span>{item ? <ItemLine item={item} showAffixes={false} /> : '—'}</span>
          </div>
        );
      })}

      <h2 className="title" style={{ fontSize: '1rem', marginTop: 14 }}>
        Bag ({player.items.length})
      </h2>
      <div className="option-list">
        {player.items.length === 0 && <p className="subtitle">Empty. Monsters and chests drop gear.</p>}
        {player.items.map((item) => (
          <div className="item-row" key={item.uid}>
            <div className="item-desc">
              <ItemLine item={item} />
            </div>
            <button className="btn small" onClick={() => dispatch({ type: 'EQUIP', uid: item.uid })}>
              Equip
            </button>
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
