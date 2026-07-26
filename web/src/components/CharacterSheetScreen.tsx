import { useRef, useState, type CSSProperties } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { Stat } from '../engine/types';
import { RACE_TRAITS, CLASS_TRAITS, TALENTS, unlockedTalents } from '../engine/data/traits';
import { STAT_LABEL, STATUS_DESC } from '../engine/data/keywords';
import { RACES } from '../engine/data/races';
import { CLASSES } from '../engine/data/classes';
import { FAMILY_INFO, familyWeakness } from '../engine/data/species';
import { THE_ARRANGEMENT } from '../engine/data/theArrangement';
import {
  attributeBreakdowns,
  derivedBreakdowns,
  heroScalingLines,
  mitigationLines,
  scalingBonusOf,
  shapingMultipliers,
  standingEffects,
  type Breakdown,
  type Contribution,
} from '../engine/statBreakdown';
import { HeroImage, MonsterImage } from '../art/MonsterImage';
import { ELEMENT_ICON } from '../art/elementIcons';
import { KeywordText } from './KeywordText';
import { NpcHost } from './NpcHost';
import { useNavScope, useRefocusOn } from '../nav';
import '../sheets.css';
import '../charsheet.css';

// v20: the character sheet stopped being the gear screen wearing a different
// name. Gear moved to GearScreen; what stayed is the accounting — every number
// on the hero traced back to the blood, the schooling, the levels, the affixes
// and the things still counting down on them. Nothing here is re-derived: the
// terms come from engine/statBreakdown, which mirrors the engine and is held
// to it by engine/test/charSheet.test.ts.

const STATS: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

function TermRow({ term }: { term: Contribution }) {
  const isMult = term.mult !== undefined;
  const value = isMult ? `×${term.mult}` : signed(term.amount);
  const tone = isMult ? (term.mult! < 1 ? 'down' : 'up') : term.amount > 0 ? 'up' : term.amount < 0 ? 'down' : 'flat';
  return (
    <li className={`cdd-term cdd-term-${term.kind}`}>
      <span className={`cdd-term-val cdd-${tone}`}>{value}</span>
      <span className="cdd-term-source">{term.source}</span>
      {term.detail && <span className="cdd-term-detail">{term.detail}</span>}
    </li>
  );
}

function Ledger({ breakdown }: { breakdown: Breakdown }) {
  return (
    <details className="cdd-ledger">
      <summary className="cdd-ledger-summary">
        <span className="cdd-ledger-label">{breakdown.label}</span>
        <span className="cdd-ledger-total">{breakdown.total}</span>
        <span className="cdd-ledger-terms">
          {breakdown.contributions.length} term{breakdown.contributions.length === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="cdd-ledger-body">
        <p className="cdd-meaning">
          <KeywordText text={breakdown.meaning} />
        </p>
        <ul className="cdd-terms">
          {breakdown.contributions.map((term, i) => (
            <TermRow term={term} key={i} />
          ))}
          <li className="cdd-term cdd-term-total">
            <span className="cdd-term-val">{breakdown.total}</span>
            <span className="cdd-term-source">{breakdown.label}</span>
            <span className="cdd-term-detail">{breakdown.formula}</span>
          </li>
        </ul>
        {breakdown.note && (
          <p className="cdd-note">
            <KeywordText text={breakdown.note} />
          </p>
        )}
      </div>
    </details>
  );
}

export function CharacterSheetScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [codex, setCodex] = useState(false);

  const attributes = attributeBreakdowns(player);
  const derived = derivedBreakdowns(player);
  const byId = Object.fromEntries(derived.map((b) => [b.id, b]));
  const headline = ['attack', 'magic', 'defense', 'magicDefense', 'maxHp', 'maxMp', 'crit', 'vigor'];
  const expPct = Math.min(100, Math.round((player.exp / player.expToNext()) * 100));
  const standing = standingEffects(player);
  const scalings = heroScalingLines(player);
  const mitigations = mitigationLines(player);
  const shaping = shapingMultipliers(player).filter((s) => s.value !== 1);

  // The densest focus surface in the game: eighteen `<details>` disclosures,
  // seven `+` buttons that exist only while there are points to spend, two
  // folds, and — until KeywordText grew a `navigable` switch — forty to eighty
  // inline glossary spans. The terms are out of the pad's ring now (Tab still
  // reaches them), which leaves this screen as roughly thirty real controls.
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'characterSheet',
    onCancel: () => {
      // The codex closes first. B meaning "close the thing on top of the thing"
      // is what it means everywhere else, and the overlay has its own scope
      // below anyway — this branch only catches the case where the overlay's
      // root has not mounted yet.
      if (codex) {
        setCodex(false);
        return true;
      }
      dispatch({ type: 'GOTO', screen: backScreen });
      return true;
    },
  });
  // Spending the last attribute point unmounts every `+` button at once,
  // including the one the cursor is standing on.
  useRefocusOn([player.attributePoints]);

  return (
    <div className="panel char-screen cdd-screen" ref={root}>
      <div className="sheet-head">
        <div>
          <h1 className="title" style={{ margin: 0 }}>
            {player.name}
          </h1>
          <p className="subtitle" style={{ margin: '6px 0 0' }}>
            Level {player.level} {player.race} {player.className} · EXP {player.exp}/{player.expToNext()}
          </p>
        </div>
        <button className="btn small" onClick={() => setCodex(true)}>
          📖 The Arrangement
        </button>
      </div>

      <NpcHost npcId="rowan" state={state} />

      <div className="char-topbar">
        {headline.map((id) => (
          <div className="char-stat-tile" key={id} title={byId[id].formula}>
            <span className="char-stat-val">{id === 'crit' ? `${byId[id].total}%` : byId[id].total}</span>
            <span className="char-stat-label">{byId[id].label}</span>
          </div>
        ))}
      </div>

      <div className="cdd-layout">
        <aside className="sheet-figure-panel cs-hero-panel">
          <div className="cs-level-ring" style={{ '--ring-pct': `${expPct}%` } as CSSProperties} title={`EXP ${player.exp}/${player.expToNext()}`}>
            <span className="cs-level-num">{player.level}</span>
            <span className="cs-level-word">Level</span>
          </div>
          <div className="figure-plinth">
            <HeroImage className={player.className} size={200} />
          </div>
          <div className="cs-hero-id">
            {player.race} {player.className}
          </div>
          <div className="cs-exp">
            <div className="cs-exp-track">
              <div className="cs-exp-fill" style={{ width: `${expPct}%` }} />
            </div>
            <span className="cs-exp-label">
              <span>EXP</span>
              <span>
                {player.exp}/{player.expToNext()}
              </span>
            </span>
          </div>
          <p className="cdd-blurb">{RACES[player.race].description}</p>
          <p className="cdd-blurb">{CLASSES[player.className].description}</p>
          <button className="btn small cdd-gear-link" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
            🎒 Gear &amp; bag ▸
          </button>
        </aside>

        <div className="cdd-main">
          <section>
            <div className="cdd-section-head">
              <h2 className="sheet-section-title" style={{ margin: 0 }}>
                Attributes
              </h2>
              {player.attributePoints > 0 ? (
                <span className="cs-points">✨ {player.attributePoints} unspent</span>
              ) : (
                <span className="subtitle cdd-section-note">Every point spent.</span>
              )}
            </div>
            <p className="subtitle cdd-section-note">
              Each row opens onto its arithmetic — what you were born with, what your oath added, what you trained, what you are wearing, and what is
              currently being done to you.
            </p>
            <div className="cdd-attr-list">
              {STATS.map((stat, i) => {
                const b = attributes[i];
                return (
                  <div className="cdd-attr-row" key={stat}>
                    <Ledger breakdown={b} />
                    <div className="cdd-attr-side">
                      <span className="cdd-attr-key">{stat}</span>
                      {player.attributePoints > 0 && (
                        <button
                          className="attr-orb-plus cdd-plus"
                          onClick={() => dispatch({ type: 'SPEND_ATTRIBUTE', stat })}
                          title={`Raise ${STAT_LABEL[stat]}`}
                          aria-label={`Spend a point on ${STAT_LABEL[stat]}`}
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="sheet-section-title">Derived</h2>
            <p className="subtitle cdd-section-note">
              Nothing below is stored. Every one of these is recomputed from the rows above the instant anything changes.
            </p>
            <div className="cdd-derived-list">
              {derived.map((b) => (
                <Ledger breakdown={b} key={b.id} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="sheet-section-title">What your defences turn aside</h2>
            <p className="subtitle cdd-section-note">
              An enemy's blow is announced with your armour already taken out of it. Which wall it meets depends on what kind of blow it is — and the
              two walls are separate. Stacking one does nothing for the other.
            </p>
            <table className="cdd-table">
              <thead>
                <tr>
                  <th>Blow</th>
                  <th>Met by</th>
                  <th>Now</th>
                  <th>Turns aside</th>
                </tr>
              </thead>
              <tbody>
                {mitigations.map((line) => (
                  <tr key={line.school} title={line.meaning}>
                    <td>
                      <span className="pill">{line.label}</span>
                    </td>
                    <td>
                      <KeywordText text={line.source} />
                    </td>
                    <td className="cdd-num">{line.value}</td>
                    <td className="cdd-num cdd-strong">−{line.turnsAside.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="subtitle cdd-section-note">
              {mitigations.map((line) => (
                <span key={line.school} style={{ display: 'block' }}>
                  <strong>{line.label}:</strong> <KeywordText text={line.meaning} />
                </span>
              ))}
            </p>
          </section>

          <section>
            <h2 className="sheet-section-title">What your cards read</h2>
            <p className="subtitle cdd-section-note">
              A card's printed number is only its floor. Scaling cards add a share of one of your numbers, rounded down.
            </p>
            <table className="cdd-table">
              <thead>
                <tr>
                  <th>Scaling</th>
                  <th>Reads</th>
                  <th>Now</th>
                  <th>Adds</th>
                </tr>
              </thead>
              <tbody>
                {scalings.map((line) => (
                  <tr key={line.scaling}>
                    <td>
                      <span className="pill">{line.scaling}</span>
                    </td>
                    <td>
                      <KeywordText text={line.source} />
                    </td>
                    <td className="cdd-num">{line.value}</td>
                    <td className="cdd-num cdd-strong">+{line.bonus}</td>
                  </tr>
                ))}
                {state.party.map((m) => (
                  <tr key={`mstr-${m.uid}`}>
                    <td>
                      <span className="pill">MSTR</span>
                    </td>
                    <td>{m.nickname}'s Attack</td>
                    <td className="cdd-num">{m.getAttack()}</td>
                    <td className="cdd-num cdd-strong">+{scalingBonusOf(m.getAttack())}</td>
                  </tr>
                ))}
                {state.party.map((m) => (
                  <tr key={`mint-${m.uid}`}>
                    <td>
                      <span className="pill">MINT</span>
                    </td>
                    <td>{m.nickname}'s Magic Power</td>
                    <td className="cdd-num">{m.getMagicPower()}</td>
                    <td className="cdd-num cdd-strong">+{scalingBonusOf(m.getMagicPower())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.party.length === 0 && (
              <p className="subtitle cdd-section-note">
                MSTR and MINT cards read the monster that grants them. With no companions walking beside you, they add nothing.
              </p>
            )}
          </section>

          {shaping.length > 0 && (
            <section>
              <h2 className="sheet-section-title">What bends on the way out</h2>
              <div className="cdd-shaping">
                {shaping.map((s) => (
                  <div className="cdd-shape-row" key={s.label}>
                    <span className={`cdd-shape-val ${s.value > 1 ? 'cdd-up' : 'cdd-down'}`}>×{s.value}</span>
                    <div>
                      <b>{s.label}</b>
                      <div className="affix-line">{s.terms.map((t) => `${t.source} (${t.detail})`).join(' · ')}</div>
                      <div className="affix-line">
                        <KeywordText text={s.meaning} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="sheet-section-title">
              Standing on you <span className="sheet-sec-count">{standing.length}</span>
            </h2>
            {standing.length === 0 ? (
              <p className="subtitle">Nothing is being done to you at present. Statuses and battle blessings appear here while they last.</p>
            ) : (
              <div className="cdd-standing">
                {standing.map((e, i) => (
                  <div className={`cdd-standing-row ${e.good ? 'cdd-good' : 'cdd-bad'}`} key={i}>
                    <b>{e.name}</b>
                    <span className="pill">{e.detail}</span>
                    {e.kind === 'status' && (
                      <div className="affix-line">
                        <KeywordText text={STATUS_DESC[e.name as keyof typeof STATUS_DESC]} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="sheet-section-title">Elements</h2>
            <p className="subtitle cdd-section-note">
              Your blood answers to no element — nothing thrown at you is multiplied for being Fire or Dark. Your companions are not so
              indifferent, and what they are weak to is what the gates will find.
            </p>
            {state.party.length === 0 ? (
              <p className="subtitle">No companions to speak for.</p>
            ) : (
              <div className="cdd-elements">
                {state.party.map((m) => {
                  const resists = FAMILY_INFO[m.family].resists;
                  const weak = familyWeakness(m.family);
                  return (
                    <div className="cdd-element-row" key={m.uid}>
                      <MonsterImage speciesId={m.speciesId} size={32} rarity={m.rarity} />
                      <div>
                        <b>{m.nickname}</b> <span className="pill">{m.family}</span>
                        <div className="affix-line">
                          {Object.entries(resists).length === 0
                            ? 'Takes everything at face value.'
                            : Object.entries(resists).map(([el, mult]) => (
                                <span key={el} className={`cdd-el ${mult > 1 ? 'cdd-bad' : 'cdd-good'}`}>
                                  {ELEMENT_ICON[el as keyof typeof ELEMENT_ICON]} {el} ×{mult}
                                </span>
                              ))}
                        </div>
                        {weak && <div className="affix-line">Keep it out of {weak}.</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <details className="char-fold" open>
        <summary>⚔️ Blood &amp; Oath · Talents</summary>
        <div className="option-list">
          <div className="item-row">
            <div className="item-desc">
              <b>{RACE_TRAITS[player.race].name}</b> <span className="pill">{player.race}</span>
              <div className="affix-line">
                <KeywordText text={RACE_TRAITS[player.race].text} />
              </div>
            </div>
          </div>
          <div className="item-row">
            <div className="item-desc">
              <b>{CLASS_TRAITS[player.className].name}</b> <span className="pill">{player.className}</span>
              <div className="affix-line">
                <KeywordText text={CLASS_TRAITS[player.className].text} />
              </div>
            </div>
          </div>
          {unlockedTalents(player.level).map((t) => (
            <div className="item-row" key={t.id}>
              <div className="item-desc">
                ✦ <b>{t.name}</b> <span className="pill">Lv {t.level}</span>
                <div className="affix-line">
                  <KeywordText text={t.text} />
                </div>
              </div>
            </div>
          ))}
          {(() => {
            const next = TALENTS.find((t) => player.level < t.level);
            return next ? (
              <div className="item-row" style={{ opacity: 0.5 }}>
                <div className="item-desc">
                  ◇ <b>{next.name}</b> <span className="pill">at Lv {next.level}</span>
                  <div className="affix-line">
                    <KeywordText text={next.text} />
                  </div>
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
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
          🎒 Gear
        </button>
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>

      {codex && <ArrangementCodex onClose={() => setCodex(false)} />}
    </div>
  );
}

/**
 * The Arrangement, as a proper modal.
 *
 * It was click-outside-to-close and nothing else: no Escape, no focus trap, no
 * focus restore. Its own scope one layer up fixes all three at once — B and
 * Escape close it, the cursor cannot walk out into the sheet behind it, and
 * when it unmounts the sheet's scope takes the cursor back to where it was.
 */
function ArrangementCodex({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useNavScope(ref, {
    id: 'characterSheet.codex',
    layer: 10,
    trap: true,
    onCancel: () => {
      onClose();
      return true;
    },
  });
  return (
    <div className="codex-overlay" ref={ref} onClick={onClose}>
      <div className="codex-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="title">{THE_ARRANGEMENT.title}</h2>
        {THE_ARRANGEMENT.paragraphs.map((p, i) => (
          <p className="codex-text" key={i}>
            {p}
          </p>
        ))}
        <div className="btn-row">
          <button className="btn primary" onClick={onClose}>
            Close the book
          </button>
        </div>
      </div>
    </div>
  );
}
