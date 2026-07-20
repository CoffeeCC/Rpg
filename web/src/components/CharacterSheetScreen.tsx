import type { GameAction, GameState, Screen } from '../engine/game';
import type { Stat } from '../engine/types';
import { RACE_TRAITS, CLASS_TRAITS, TALENTS, unlockedTalents } from '../engine/data/traits';

const STATS: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];

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
        <div className="stat-row" key={stat}>
          <span>{stat}</span>
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

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
