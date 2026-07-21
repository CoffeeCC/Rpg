import { useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { Stat, ItemV2 } from '../engine/types';
import type { EquipKey } from '../engine/entities/Character';
import { RACE_TRAITS, CLASS_TRAITS, TALENTS, unlockedTalents, talentsFor } from '../engine/data/traits';
import { BALANCE } from '../engine/data/balance';
import { THE_ARRANGEMENT } from '../engine/data/theArrangement';
import { HeroImage, MonsterImage } from '../art/MonsterImage';
import { gearImage } from '../art/gearArt';
import { ItemHover, type CompareMetric } from './ItemHover';
import { ItemLine } from './ItemLine';
import { NpcHost } from './NpcHost';

// v12: one PoE2/Diablo-style "character" screen — paperdoll in the middle,
// derived combat stats across the top, attributes down the right rail, bag
// below, and the deeper stuff (oaths, talents, party) folded underneath. Both
// the Character and Equipment town buttons land here.

const STATS: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];

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

function statDetail(stat: Stat, v: number): string {
  switch (stat) {
    case 'STR':
      return `Powers physical cards (+${v} STR-scaled damage) and adds ${v * 3} max HP.`;
    case 'DEF':
      return `Subtracted from incoming physical hits (−${v}) and adds ${v * 2} max HP.`;
    case 'DEX':
      return `Floor movement: +${Math.floor(v / 15)} MOV (one more every 15 DEX).`;
    case 'MANA':
      return `Adds ${v * 4} max MP. MP fuels your monsters' battle instincts.`;
    case 'MAGDEF':
      return `Subtracted from incoming magical damage (−${v}).`;
    case 'INT':
      return `Powers magical cards (+${v} INT-scaled damage) and strengthens mending.`;
    case 'LUCK':
      return `Crit +${Math.floor(v / BALANCE.critLuckDiv)}% (1% per ${BALANCE.critLuckDiv}), better loot, kinder shops.`;
  }
}

export function CharacterSheetScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [bagFilter, setBagFilter] = useState<'all' | ItemV2['slot']>('all');
  const [codex, setCodex] = useState(false);

  const crit = BALANCE.critBase + Math.floor(player.effectiveStat('LUCK') / BALANCE.critLuckDiv) + talentsFor(player.level).critBonus;
  const mov = Math.max(2, 4 + Math.floor(player.effectiveStat('DEX') / 15) + (player.equipment.boots ? 1 : 0) + player.traits.moveBonus);

  const topStats: [string, string | number, string][] = [
    ['Attack', player.getAttack(), 'STR + weapon implicits + gear Attack. Base of every physical card.'],
    ['Magic', player.getMagicPower(), 'INT + staff implicits + gear Magic. Base of every spell card.'],
    ['Defense', player.getDefense(), 'DEF + armor implicits + gear Defense. Cut from physical hits.'],
    ['M.Def', player.getMagicDefense(), 'MAGDEF + half your armor. Cut from magical hits.'],
    ['Max HP', player.maxHp, '40 + STR×3 + DEF×2 + level×8 + gear, times race modifier.'],
    ['Max MP', player.maxMp, '10 + MANA×4 + level×3 + gear. Spent on monster instincts.'],
    ['Crit', `${crit}%`, `${BALANCE.critBase}% base + LUCK/${BALANCE.critLuckDiv} + talents. Crits hit much harder.`],
    ['MOV', mov, '4 + DEX/15 + boots + traits. Tiles per turn on gate floors.'],
  ];

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

  const accessories = player.items.filter((i) => i.slot === 'charm' || i.slot === 'trinket');
  const gearItems = player.items.filter((i) => i.slot !== 'charm' && i.slot !== 'trinket');
  const bag = bagFilter === 'all' ? gearItems : gearItems.filter((i) => i.slot === bagFilter);

  const renderSlot = (key: EquipKey) => {
    const worn = player.equipment[key];
    const icon = worn ? gearImage(worn) : null;
    const slotType: ItemV2['slot'] = key === 'ring2' ? 'ring' : (key as ItemV2['slot']);
    const cell = (
      <button
        className={`doll-slot ${worn ? `doll-filled rarity-frame-${worn.rarity}` : 'doll-empty'}`}
        style={{ gridArea: SLOT_AREA[key] }}
        onClick={() => setBagFilter(bagFilter === slotType ? 'all' : slotType)}
        title={worn ? undefined : `${SLOT_LABEL[key]} — empty. Click to filter the bag.`}
      >
        {worn ? (
          icon ? <img src={icon} alt="" className="doll-slot-img" draggable={false} /> : <span className="doll-slot-emoji">{SLOT_EMOJI[key]}</span>
        ) : (
          <span className="doll-slot-ghost">{SLOT_EMOJI[key]}</span>
        )}
        <span className="doll-slot-label">{SLOT_LABEL[key]}</span>
      </button>
    );
    return worn ? (
      <ItemHover item={worn} key={key}>
        {cell}
      </ItemHover>
    ) : (
      <span key={key} style={{ display: 'contents' }}>
        {cell}
      </span>
    );
  };

  return (
    <div className="panel char-screen">
      <div className="char-frame">
        <div className="char-header">
          <div>
            <h1 className="title" style={{ margin: 0 }}>
              {player.name}
            </h1>
            <p className="subtitle" style={{ margin: 0 }}>
              Level {player.level} {player.race} {player.className} · EXP {player.exp}/{player.expToNext()}
            </p>
          </div>
          <button className="btn small" onClick={() => setCodex(true)}>
            📖 The Arrangement
          </button>
        </div>

        <NpcHost npcId="rowan" state={state} />

        <div className="char-topbar">
          {topStats.map(([label, value, how]) => (
            <div className="char-stat-tile" key={label} title={how}>
              <span className="char-stat-val">{value}</span>
              <span className="char-stat-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="char-main">
          <div className="paperdoll">
            <div className="doll-figure">
              <HeroImage className={player.className} size={225} />
            </div>
            {(Object.keys(SLOT_AREA) as EquipKey[]).map(renderSlot)}
          </div>

          <div className="char-rail">
            {player.attributePoints > 0 && <div className="char-points">✨ {player.attributePoints} points</div>}
            {STATS.map((stat) => {
              const v = player.effectiveStat(stat);
              return (
                <div className="attr-orb" key={stat} title={statDetail(stat, v)}>
                  <span className="attr-orb-val">{v}</span>
                  <span className="attr-orb-name">{stat}</span>
                  {player.attributePoints > 0 && (
                    <button className="attr-orb-plus" onClick={() => dispatch({ type: 'SPEND_ATTRIBUTE', stat })} title={`Raise ${stat}`}>
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="equip-bag">
          <div className="equip-bag-head">
            <h2 className="title" style={{ fontSize: '0.95rem', margin: 0 }}>
              Bag ({gearItems.length}) {bagFilter !== 'all' && <span className="pill">{bagFilter}</span>}
            </h2>
            {bagFilter !== 'all' && (
              <button className="btn small" onClick={() => setBagFilter('all')}>
                Show all
              </button>
            )}
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
      </div>

      <details className="char-fold">
        <summary>⚔️ Blood &amp; Oath · Talents</summary>
        <div className="option-list">
          <div className="item-row">
            <div className="item-desc">
              <b>{RACE_TRAITS[player.race].name}</b> <span className="pill">{player.race}</span>
              <div className="affix-line">{RACE_TRAITS[player.race].text}</div>
            </div>
          </div>
          <div className="item-row">
            <div className="item-desc">
              <b>{CLASS_TRAITS[player.className].name}</b> <span className="pill">{player.className}</span>
              <div className="affix-line">{CLASS_TRAITS[player.className].text}</div>
            </div>
          </div>
          {unlockedTalents(player.level).map((t) => (
            <div className="item-row" key={t.id}>
              <div className="item-desc">
                ✦ <b>{t.name}</b> <span className="pill">Lv {t.level}</span>
                <div className="affix-line">{t.text}</div>
              </div>
            </div>
          ))}
          {(() => {
            const next = TALENTS.find((t) => player.level < t.level);
            return next ? (
              <div className="item-row" style={{ opacity: 0.5 }}>
                <div className="item-desc">
                  ◇ <b>{next.name}</b> <span className="pill">at Lv {next.level}</span>
                  <div className="affix-line">{next.text}</div>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </details>

      <details className="char-fold">
        <summary>🐾 Party ({state.party.length})</summary>
        <div className="option-list">
          {state.party.length === 0 && <p className="subtitle">No companions yet. Tame a monster out in the gates.</p>}
          {state.party.map((m) => (
            <button key={m.uid} className="item-row party-link" onClick={() => dispatch({ type: 'OPEN_MONSTER', uid: m.uid })}>
              <MonsterImage speciesId={m.speciesId} size={40} rarity={m.rarity} />
              <div className="item-desc" style={{ flex: 1 }}>
                <b>{m.nickname}</b> <span className="pill">Lv{m.level}</span>
                {m.personality && <span className="pill personality-pill">{m.personality.name}</span>}
                <span className="pill">🤝 {m.bond}</span>
                <div className="affix-line">Open character sheet ▸</div>
              </div>
            </button>
          ))}
        </div>
      </details>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>

      {codex && (
        <div className="codex-overlay" onClick={() => setCodex(false)}>
          <div className="codex-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="title">{THE_ARRANGEMENT.title}</h2>
            {THE_ARRANGEMENT.paragraphs.map((p, i) => (
              <p className="codex-text" key={i}>
                {p}
              </p>
            ))}
            <div className="btn-row">
              <button className="btn primary" onClick={() => setCodex(false)}>
                Close the book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
