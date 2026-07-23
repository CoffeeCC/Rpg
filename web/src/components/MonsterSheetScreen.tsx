import type { GameAction, GameState } from '../engine/game';
import type { ItemV2 } from '../engine/types';
import { FAMILY_INFO } from '../engine/data/species';
import { getSkill } from '../engine/data/skills';
import { MonsterImage } from '../art/MonsterImage';
import { ItemLine } from './ItemLine';
import { Icon } from './Icon';

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
    <div className="accessory-slot">
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
  if (!monster) {
    return (
      <div className="panel">
        <p className="subtitle">That companion is no longer with you.</p>
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'stable' })}>
          Back to the Stable
        </button>
      </div>
    );
  }
  const p = monster.personality;
  const a = monster.aspect;
  const inParty = state.party.some((m) => m.uid === monster.uid);
  const charms = state.player!.items.filter((i) => i.slot === 'charm');
  const trinkets = state.player!.items.filter((i) => i.slot === 'trinket');

  return (
    <div className="panel monster-sheet">
      <div className="monster-sheet-head">
        <div className="monster-sheet-portrait">
          <MonsterImage speciesId={monster.speciesId} size={180} rarity={monster.rarity} />
        </div>
        <div className="monster-sheet-title">
          <h1 className="title" style={{ marginBottom: 4 }}>
            {monster.nickname}
          </h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {monster.species.name} · Lv {monster.level} {monster.plus > 0 ? `· +${monster.plus} (gen ${monster.plus})` : ''} ·{' '}
            <Icon name={`family_${monster.family.toLowerCase()}`} emoji={FAMILY_INFO[monster.family].emoji} size={14} /> {monster.family} ·{' '}
            {inParty ? 'in your party' : 'in the stable'}
          </p>
          {a && (
            <p className="affix-line" title={a.blurb}>
              ✶ <b>{a.name}</b> — {a.blurb}
            </p>
          )}
          {p && (
            <p className="affix-line">
              <b className="personality-pill">{p.name}</b> — {p.blurb} <i>Instinct: {p.instinctText}</i>
            </p>
          )}
          <p className="affix-line">
            🤝 Bond {monster.bond} {monster.bond >= 25 ? '(devoted)' : monster.bond >= 10 ? '(loyal)' : ''} · HP {monster.hp}/{monster.maxHp} · MP{' '}
            {monster.mp}/{monster.maxMp}
          </p>
        </div>
      </div>

      <div className="monster-sheet-cols">
        <div>
          <h2 className="title" style={{ fontSize: '1rem' }}>
            Stats
          </h2>
          {STAT_ORDER.map((s) => (
            <div className="stat-row" key={s}>
              <span>{s}</span>
              <span>{monster.stats[s]}</span>
            </div>
          ))}
          <h2 className="title" style={{ fontSize: '1rem', marginTop: 12 }}>
            Skills
          </h2>
          <div className="affix-line">{monster.knownSkills.map((id) => getSkill(id)?.name ?? id).join(' · ') || 'No learned skills.'}</div>
        </div>

        <div>
          <h2 className="title" style={{ fontSize: '1rem' }}>
            Accessories
          </h2>
          <AccessorySlot label="Charm" slot="charm" worn={monster.charm} bag={charms} monsterUid={monster.uid} dispatch={dispatch} />
          <AccessorySlot label="Trinket" slot="trinket" worn={monster.trinket} bag={trinkets} monsterUid={monster.uid} dispatch={dispatch} />
        </div>
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'stable' })}>
          Back to the Stable
        </button>
      </div>
    </div>
  );
}
