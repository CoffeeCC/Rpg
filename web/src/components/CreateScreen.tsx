import { useMemo, useRef, useState } from 'react';
import { RACES } from '../engine/data/races';
import { CLASSES } from '../engine/data/classes';
import { RACE_TRAITS, CLASS_TRAITS } from '../engine/data/traits';
import type { GameAction } from '../engine/game';
import type { RaceName, ClassName } from '../engine/types';
import { Character } from '../engine/entities/Character';
import { HeroImage } from '../art/MonsterImage';
import { RACE_ART } from '../art/raceArt';
import { PAINTED_TOWN } from '../art/painted';
import { SLOT_COUNT, getSlotSummary, loadFromSlot, importSaveFromFile } from '../platform/browserSave';
import { loadTellings } from '../platform/tellings';

export function CreateScreen({ dispatch }: { dispatch: (a: GameAction) => void }) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<RaceName>('Human');
  const [className, setClassName] = useState<ClassName>('Warrior');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canBegin = name.trim().length > 0;
  const telling = loadTellings().telling;
  const saves = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1)
    .map((slot) => getSlotSummary(slot))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // Live preview: build a throwaway hero so the numbers you'll start with are
  // shown before you commit, and they update as you pick race/class.
  const preview = useMemo(() => new Character(name.trim() || 'Nameless', race, className), [name, race, className]);
  const stats: [string, number][] = [
    ['HP', preview.maxHp],
    ['MP', preview.maxMp],
    ['ATK', preview.getAttack()],
    ['MAG', preview.getMagicPower()],
    ['DEF', preview.getDefense()],
  ];

  function handleContinue(slot: number) {
    const result = loadFromSlot(slot);
    if (typeof result === 'string') return setMessage(result);
    dispatch({ type: 'LOAD_STATE', state: result });
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await importSaveFromFile(file);
    if (typeof result === 'string') return setMessage(result);
    dispatch({ type: 'LOAD_STATE', state: result });
  }

  return (
    <div className="forge">
      <div className="forge-backdrop">
        <img src={PAINTED_TOWN} alt="" draggable={false} />
      </div>

      <div className="forge-inner">
        <header className="forge-masthead">
          <h1 className="forge-title">Everdusk</h1>
          <p className="forge-tagline">The light is failing. The gates are open. The notice board is hiring.</p>
          {telling > 1 && (
            <p className="forge-telling">
              The Chronicler calls this the {ordinal(telling)} telling. You do not remember the others. The town might.
            </p>
          )}
        </header>

        {saves.length > 0 && (
          <div className="forge-continue">
            {saves.map((s) => (
              <button type="button" key={s.slot} className="forge-save" onClick={() => handleContinue(s.slot)}>
                <span className="forge-save-name">
                  ↺ {s.name} · Lv {s.level}
                </span>
                <span className="forge-save-where">
                  {s.where} · {s.orbs}/4 orbs
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="forge-stage">
          <aside className="forge-rail">
            <h2 className="forge-rail-head">Blood</h2>
            {(Object.keys(RACES) as RaceName[]).map((r) => (
              <button type="button" key={r} className={`forge-chip ${race === r ? 'sel' : ''}`} onClick={() => setRace(r)}>
                {RACE_ART[r] ? (
                  <span className="forge-chip-art forge-chip-race">
                    <img src={RACE_ART[r]} alt="" draggable={false} />
                  </span>
                ) : (
                  <span className="forge-chip-emblem">{r[0]}</span>
                )}
                <span className="forge-chip-body">
                  <span className="forge-chip-name">{r}</span>
                  <span className="forge-chip-sub">{RACE_TRAITS[r].name}</span>
                </span>
              </button>
            ))}
          </aside>

          <div className="forge-hero">
            <div className="forge-hero-art">
              <HeroImage className={className} size={230} />
              <span className="forge-hero-plinth" aria-hidden="true" />
            </div>
            <input
              className="forge-nameplate"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="name your hero"
              maxLength={24}
              aria-label="Name your hero"
            />
            <p className="forge-hero-title">
              {name.trim() || 'The Nameless'} — {race} {className}
            </p>
            <div className="forge-stats">
              {stats.map(([k, v]) => (
                <span className="forge-stat" key={k}>
                  <b>{v}</b>
                  <span>{k}</span>
                </span>
              ))}
            </div>
            <p className="forge-hero-trait">
              <b>{RACE_TRAITS[race].name}.</b> {RACE_TRAITS[race].text}
            </p>
            <p className="forge-hero-trait">
              <b>{CLASS_TRAITS[className].name}.</b> {CLASS_TRAITS[className].text}
            </p>
          </div>

          <aside className="forge-rail">
            <h2 className="forge-rail-head">Calling</h2>
            {(Object.keys(CLASSES) as ClassName[]).map((c) => (
              <button type="button" key={c} className={`forge-chip forge-chip-class ${className === c ? 'sel' : ''}`} onClick={() => setClassName(c)}>
                <span className="forge-chip-art">
                  <HeroImage className={c} size={38} />
                </span>
                <span className="forge-chip-body">
                  <span className="forge-chip-name">{c}</span>
                  <span className="forge-chip-sub">{CLASS_TRAITS[c].name}</span>
                </span>
              </button>
            ))}
          </aside>
        </div>

        <div className="forge-actions">
          <button className="btn small forge-import" onClick={() => fileInputRef.current?.click()}>
            ⬆ Import save
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          <button
            className="btn primary forge-begin"
            disabled={!canBegin}
            onClick={() => dispatch({ type: 'CREATE_CHARACTER', name: name.trim(), race, className })}
          >
            {telling > 1 ? 'Begin the Next Telling' : 'Begin the Telling'}
          </button>
        </div>
        {message && <p className="forge-message">{message}</p>}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  return words[n] ?? `${n}th`;
}
