import type { GameAction, GameState, Screen } from '../engine/game';
import type { Stat } from '../engine/types';
import { RACE_TRAITS, CLASS_TRAITS, TALENTS, unlockedTalents } from '../engine/data/traits';
import { MonsterImage } from '../art/MonsterImage';

const STATS: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];

const STAT_HELP: Record<string, string> = {
  STR: 'Strength - physical card damage, and it pads your maximum HP.',
  DEF: 'Defense - shrinks incoming hits; feeds Ward-granting instincts.',
  DEX: 'Dexterity - +1 MOV on floors per 15 DEX. Quickness in all things.',
  MANA: 'Mana - raises max MP; MP fuels your monsters\u2019 instincts.',
  MAGDEF: 'Magic Defense - shrinks incoming magical damage.',
  INT: 'Intellect - magical card damage and the strength of mending.',
  LUCK: 'Luck - better loot rarity, better shop finds, kinder rolls.',
};

export function CharacterSheetScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  return (
    <div className="panel">
      <h1 className="title">
        🧝 {player.name} — Level {player.level}
      </h1>
      <p className="subtitle">
        {player.race} {player.className} · EXP {player.exp}/{player.expToNext()} · Attack {player.getAttack()} · Defense {player.getDefense()}
      </p>
      {player.attributePoints > 0 && <p className="subtitle">✨ {player.attributePoints} attribute points to spend</p>}

      {STATS.map((stat) => (
        <div className="stat-row" key={stat} title={STAT_HELP[stat]}>
          <span>
            {stat}
            <span className="stat-help">{STAT_HELP[stat]}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {player.effectiveStat(stat)}
            {player.attributePoints > 0 && (
              <button className="btn small" onClick={() => dispatch({ type: 'SPEND_ATTRIBUTE', stat })}>
                +1
              </button>
            )}
          </span>
        </div>
      ))}

      <h2 className="title" style={{ fontSize: '1rem', marginTop: 14 }}>
        Blood & Oath
      </h2>
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
      </div>

      <h2 className="title" style={{ fontSize: '1rem', marginTop: 14 }}>
        Talents
      </h2>
      <div className="option-list">
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

      <h2 className="title" style={{ fontSize: '1rem', marginTop: 14 }}>
        Party
      </h2>
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

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
