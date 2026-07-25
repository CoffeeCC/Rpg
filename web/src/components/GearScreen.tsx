import { useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { ItemV2 } from '../engine/types';
import type { EquipKey } from '../engine/entities/Character';
import { equippedItems } from '../engine/statBreakdown';
import { gearImage } from '../art/gearArt';
import { ItemHover, type CompareMetric } from './ItemHover';
import { ItemLine } from './ItemLine';
import { Icon } from './Icon';
import { setAttribution, setStandings } from '../engine/data/sets';
import { UNIQUES } from '../engine/data/uniques';
import '../sheets.css';
import '../charsheet.css';
import '../gearsets.css';

// v20: gear lives on its own screen again. For a long while the Character and
// Gear doors in town opened onto the same room; this is the room with the
// racks in it — the paperdoll, the bag, what each piece is worth, and what
// swapping it would cost. Everything about who you ARE moved next door to
// CharacterSheetScreen. Dispatches are unchanged: EQUIP and SELL_GEAR are
// gated by the reducer to the 'equipment' screen, which is this one.

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
const SLOT_EMOJI: Record<EquipKey, string> = {
  weapon: '🗡️',
  armor: '🛡️',
  headpiece: '⛑️',
  gloves: '🧤',
  boots: '🥾',
  ring: '💍',
  ring2: '💍',
  amulet: '📿',
  pendant: '🧿',
};
const SLOT_AREA: Record<EquipKey, string> = {
  headpiece: 'head',
  amulet: 'amulet',
  pendant: 'pendant',
  weapon: 'weapon',
  armor: 'armor',
  gloves: 'gloves',
  ring: 'ring1',
  ring2: 'ring2',
  boots: 'boots',
};

/** Everything a worn item hands you, gathered by what it targets. */
const GEAR_TARGETS: { target: string; label: string }[] = [
  { target: 'Attack', label: 'Attack' },
  { target: 'Magic', label: 'Magic' },
  { target: 'Defense', label: 'Defense' },
  { target: 'HP', label: 'Max HP' },
  { target: 'MP', label: 'Max MP' },
  { target: 'STR', label: 'STR' },
  { target: 'DEF', label: 'DEF' },
  { target: 'DEX', label: 'DEX' },
  { target: 'MANA', label: 'MANA' },
  { target: 'MAGDEF', label: 'MAGDEF' },
  { target: 'INT', label: 'INT' },
  { target: 'LUCK', label: 'LUCK' },
];

/** Only the lines that actually move — an unchanged stat is noise on a row. */
function changedOf(metrics: CompareMetric[]): CompareMetric[] {
  return metrics.filter((m) => m.after !== m.now);
}

export function GearScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [bagFilter, setBagFilter] = useState<'all' | ItemV2['slot']>('all');

  const worn = equippedItems(player);

  // Implicits are the base item's own weight; affixes are what was rolled onto
  // it. Both are summed exactly the way Character does it.
  const implicitTotals = worn.reduce(
    (acc, { item }) => ({
      Attack: acc.Attack + item.implicitAttack,
      Magic: acc.Magic + item.implicitMagic,
      Defense: acc.Defense + item.implicitDefense,
    }),
    { Attack: 0, Magic: 0, Defense: 0 } as Record<string, number>
  );
  const affixTotals: Record<string, number> = {};
  for (const { item } of worn) {
    for (const affix of item.affixes) affixTotals[affix.target] = (affixTotals[affix.target] ?? 0) + affix.amount;
  }
  const ledger = GEAR_TARGETS.map((t) => ({
    ...t,
    implicit: implicitTotals[t.target] ?? 0,
    affix: affixTotals[t.target] ?? 0,
  })).filter((row) => row.implicit !== 0 || row.affix !== 0);

  function metricsFor(item: ItemV2): { metrics: CompareMetric[]; replaces: ItemV2 | null } {
    const ghost = player.clone();
    const replaces = ghost.equip({ ...item, affixes: item.affixes.map((a) => ({ ...a })) });
    return {
      replaces,
      metrics: [
        { label: 'Attack', now: player.getAttack(), after: ghost.getAttack() },
        { label: 'Magic', now: player.getMagicPower(), after: ghost.getMagicPower() },
        { label: 'Defense', now: player.getDefense(), after: ghost.getDefense() },
        { label: 'M.Def', now: player.getMagicDefense(), after: ghost.getMagicDefense() },
        { label: 'Max HP', now: player.maxHp, after: ghost.maxHp },
        { label: 'Max MP', now: player.maxMp, after: ghost.maxMp },
      ],
    };
  }

  // Every set the hero holds any piece of, worn or bagged. Sets they have never
  // touched are deliberately not listed: a catalogue of things you do not have
  // is a wiki, not a loadout screen.
  const standings = setStandings(
    (Object.keys(SLOT_AREA) as EquipKey[]).map((k) => player.equipment[k]),
    player.items,
  );

  const accessories = player.items.filter((i) => i.slot === 'charm' || i.slot === 'trinket');
  const gearItems = player.items.filter((i) => i.slot !== 'charm' && i.slot !== 'trinket');
  const bag = bagFilter === 'all' ? gearItems : gearItems.filter((i) => i.slot === bagFilter);

  const renderSlot = (key: EquipKey) => {
    const item = player.equipment[key];
    const icon = item ? gearImage(item) : null;
    const slotType: ItemV2['slot'] = key === 'ring2' ? 'ring' : (key as ItemV2['slot']);
    const cell = (
      <button
        className={`doll-slot ${item ? `doll-filled rarity-frame-${item.rarity}` : 'doll-empty'}`}
        style={{ gridArea: SLOT_AREA[key] }}
        onClick={() => setBagFilter(bagFilter === slotType ? 'all' : slotType)}
        title={item ? `${item.name} — click to sort the bag to this slot.` : `${SLOT_LABEL[key]} — empty. Click to sort the bag to this slot.`}
      >
        {item ? (
          icon ? <img src={icon} alt="" className="doll-slot-img" draggable={false} /> : <span className="doll-slot-emoji">{SLOT_EMOJI[key]}</span>
        ) : (
          <span className="doll-slot-ghost">{SLOT_EMOJI[key]}</span>
        )}
        <span className="doll-slot-label">{SLOT_LABEL[key]}</span>
      </button>
    );
    return item ? (
      <ItemHover item={item} key={key}>
        {cell}
      </ItemHover>
    ) : (
      <span key={key} style={{ display: 'contents' }}>
        {cell}
      </span>
    );
  };

  const slotFilters: ItemV2['slot'][] = ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring', 'amulet', 'pendant'];

  return (
    <div className="panel geq-screen">
      <div className="sheet-head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>
            Gear
          </h1>
          <p className="subtitle" style={{ margin: '6px 0 0' }}>
            What {player.name} carries and what it is worth. Nine sockets, one bag, and the arithmetic between them.
          </p>
        </div>
        <span className="geq-purse" title="Gold">
          <Icon name="gold" emoji="☉" size={18} /> {player.gold}
        </span>
      </div>

      <div className="geq-layout">
        <div className="paperdoll geq-doll">{(Object.keys(SLOT_AREA) as EquipKey[]).map(renderSlot)}</div>

        <aside className="geq-ledger">
          <h2 className="sheet-section-title" style={{ marginTop: 0 }}>
            What the racks are worth
          </h2>
          <p className="subtitle geq-ledger-note">
            Everything below comes off your gear alone. Implicits are the piece's own weight; affixes are what was rolled onto it. The character sheet
            shows where these land.
          </p>
          {ledger.length === 0 ? (
            <p className="subtitle">Nothing you wear adds anything yet. The gates provide.</p>
          ) : (
            <table className="geq-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Implicit</th>
                  <th>Affix</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.target}>
                    <td>{row.label}</td>
                    <td className="geq-num">{row.implicit ? `+${row.implicit}` : '—'}</td>
                    <td className="geq-num">{row.affix ? (row.affix > 0 ? `+${row.affix}` : row.affix) : '—'}</td>
                    <td className="geq-num geq-strong">{row.implicit + row.affix > 0 ? `+${row.implicit + row.affix}` : row.implicit + row.affix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="subtitle geq-ledger-note">
            Strength and Defense taken from gear raise your Attack and Defense, but not your max HP — only trained points do that.
          </p>
        </aside>
      </div>

      {standings.length > 0 && (
        <>
          <h2 className="sheet-section-title">
            Matched gear <span className="sheet-sec-count">{standings.length}</span>
          </h2>
          <div className="set-list">
            {standings.map((s) => {
              const attribution = setAttribution(state.world, s.set);
              return (
                <div className="set-card" key={s.set.id}>
                  <div className="set-card-head">
                    <b className="set-card-name">{s.set.name}</b>
                    <span className="pill set-pill">
                      {s.worn}/{s.max} worn
                    </span>
                    {s.held > s.worn && <span className="pill">{s.held - s.worn} in the bag</span>}
                  </div>
                  <div className="affix-line set-card-text">{s.set.text}</div>
                  {attribution && <div className="set-card-attrib">{attribution}</div>}

                  <ul className="set-piece-list">
                    {s.set.members.map((id) => {
                      const def = UNIQUES.find((u) => u.id === id);
                      const state_ = s.wornIds.includes(id) ? 'worn' : s.bagIds.includes(id) ? 'bag' : 'missing';
                      return (
                        <li key={id} className={`set-piece set-piece-${state_}`}>
                          <span className="set-piece-name">{def?.name ?? id}</span>
                          <span className="set-piece-state">
                            {state_ === 'worn' ? 'worn' : state_ === 'bag' ? 'in the bag' : 'not found'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="set-bonus-list">
                    {s.set.bonuses.map((bonus) => {
                      const met = s.worn >= bonus.pieces;
                      const isNext = s.next?.pieces === bonus.pieces;
                      return (
                        <div key={bonus.pieces} className={`set-bonus${met ? ' set-bonus-active' : ''}${isNext ? ' set-bonus-next' : ''}`}>
                          <b>{bonus.pieces} worn</b>
                          <span className="set-bonus-terms">{bonus.terms}</span>
                          {met && <span className="pill slain-pill">active</span>}
                          {isNext && <span className="pill">{bonus.pieces - s.worn} to go</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="sheet-section-title">
        Worn <span className="sheet-sec-count">{worn.length}/9</span>
      </h2>
      {worn.length === 0 ? (
        <p className="subtitle">You are wearing nothing at all.</p>
      ) : (
        <div className="geq-worn">
          {worn.map(({ key, item }) => (
            <ItemHover item={item} key={key}>
              <div className={`geq-worn-row rarity-frame-${item.rarity}`}>
                <span className="geq-worn-slot">{SLOT_LABEL[key]}</span>
                <ItemLine item={item} iconSize={36} />
              </div>
            </ItemHover>
          ))}
        </div>
      )}

      <div className="equip-bag">
        <div className="equip-bag-head">
          <h2 className="sheet-section-title" style={{ margin: 0 }}>
            Bag <span className="sheet-sec-count">{gearItems.length}</span> {bagFilter !== 'all' && <span className="pill">{bagFilter}</span>}
          </h2>
          {bagFilter !== 'all' && (
            <button className="btn small" onClick={() => setBagFilter('all')}>
              Show all
            </button>
          )}
        </div>
        <div className="geq-filters" role="group" aria-label="Sort the bag by slot">
          <button className={`btn small ${bagFilter === 'all' ? 'primary' : ''}`} onClick={() => setBagFilter('all')}>
            All
          </button>
          {slotFilters.map((slot) => (
            <button key={slot} className={`btn small ${bagFilter === slot ? 'primary' : ''}`} onClick={() => setBagFilter(slot)}>
              {slot}
            </button>
          ))}
        </div>
        {bag.length === 0 && <p className="subtitle">Nothing {bagFilter === 'all' ? 'in the bag' : 'fits that slot'}. The gates provide.</p>}
        <div className="option-list">
          {bag.map((item) => {
            const cmp = metricsFor(item);
            return (
              <ItemHover item={item} metrics={cmp.metrics} replaces={cmp.replaces} key={item.uid}>
                <div className="item-row">
                  <div className="item-desc">
                    <ItemLine item={item} showAffixes={false} iconSize={36} />
                    {/* The equip-compare deltas used to exist ONLY inside the
                        hover window, which put the single most decision-relevant
                        number on this screen out of reach of a controller and of
                        anyone not using a mouse. They are rendered inline now;
                        the hover window still shows the same figures in full. */}
                    <div className="equip-delta-row">
                      {changedOf(cmp.metrics).length === 0 ? (
                        <span className="equip-delta-none">No change to anything you are.</span>
                      ) : (
                        changedOf(cmp.metrics).map((m) => {
                          const d = m.after - m.now;
                          return (
                            <span key={m.label} className={`equip-delta ${d > 0 ? 'delta-up' : 'delta-down'}`}>
                              {m.label} {d > 0 ? '+' : ''}
                              {d}
                            </span>
                          );
                        })
                      )}
                      {cmp.replaces && <span className="equip-delta-replaces">replaces {cmp.replaces.name}</span>}
                    </div>
                  </div>
                  <button className="btn small primary" onClick={() => dispatch({ type: 'EQUIP', uid: item.uid })}>
                    Equip
                  </button>
                  <button className="btn small danger" onClick={() => dispatch({ type: 'SELL_GEAR', uid: item.uid })}>
                    Sell
                  </button>
                </div>
              </ItemHover>
            );
          })}
          {accessories.length > 0 && bagFilter === 'all' && accessories.map((item) => (
            <ItemHover item={item} key={item.uid}>
              <div className="item-row">
                <div className="item-desc">
                  <ItemLine item={item} showAffixes={false} iconSize={36} />
                  <span className="pill">monster accessory — fit it from a monster's sheet</span>
                </div>
                <button className="btn small danger" onClick={() => dispatch({ type: 'SELL_GEAR', uid: item.uid })}>
                  Sell
                </button>
              </div>
            </ItemHover>
          ))}
        </div>
      </div>

      <div className="btn-row">
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'characterSheet' })}>
          Character sheet ▸
        </button>
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
