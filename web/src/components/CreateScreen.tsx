import { useRef, useState } from 'react';
import { RACES } from '../engine/data/races';
import { CLASSES } from '../engine/data/classes';
import { RACE_TRAITS, CLASS_TRAITS } from '../engine/data/traits';
import type { GameAction } from '../engine/game';
import type { RaceName, ClassName } from '../engine/types';
import { SLOT_COUNT, getSlotSummary, loadFromSlot, importSaveFromFile } from '../platform/browserSave';
import { loadTellings } from '../platform/tellings';

export function CreateScreen({ dispatch }: { dispatch: (a: GameAction) => void }) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<RaceName>('Human');
  const [className, setClassName] = useState<ClassName>('Warrior');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canBegin = name.trim().length > 0;
  const saves = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1)
    .map((slot) => getSlotSummary(slot))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  function handleContinue(slot: number) {
    const result = loadFromSlot(slot);
    if (typeof result === 'string') {
      setMessage(result);
      return;
    }
    dispatch({ type: 'LOAD_STATE', state: result });
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await importSaveFromFile(file);
    if (typeof result === 'string') {
      setMessage(result);
      return;
    }
    dispatch({ type: 'LOAD_STATE', state: result });
  }

  return (
    <div className="panel create-panel">
      <h1 className="title">🏮 Everdusk</h1>
      <p className="subtitle">
        The light is failing. The gates are open. The notice board is hiring.
        {loadTellings().telling > 1 && (
          <span className="telling-line"> The Chronicler calls this the telling number {loadTellings().telling}. You do not remember the others. The town might.</span>
        )}
      </p>

      {saves.length > 0 && (
        <div className="field">
          <label>Continue a saved game</label>
          <div className="option-list">
            {saves.map((s) => (
              <button type="button" key={s.slot} className="option-card" onClick={() => handleContinue(s.slot)}>
                <div className="name">
                  Slot {s.slot}: {s.name} — Lv{s.level}
                </div>
                <div className="desc">
                  {s.where} · {s.orbs}/4 orbs
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 0, marginBottom: 14 }}>
        <button className="btn small" onClick={() => fileInputRef.current?.click()}>
          ⬆️ Import save from file
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
      </div>
      {message && <p className="subtitle">{message}</p>}

      <div className="field">
        <label htmlFor="hero-name">Name your hero</label>
        <input id="hero-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter a name..." maxLength={24} />
      </div>

      <div className="create-columns">
      <div className="field">
        <label>Race</label>
        <div className="option-list">
          {(Object.keys(RACES) as RaceName[]).map((r) => (
            <button type="button" key={r} className={`option-card ${race === r ? 'selected' : ''}`} onClick={() => setRace(r)}>
              <div className="name">{r} — {RACE_TRAITS[r].name}</div>
              <div className="desc">{RACES[r].description}</div>
              <div className="desc trait-line">{RACE_TRAITS[r].text}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Class</label>
        <div className="option-list">
          {(Object.keys(CLASSES) as ClassName[]).map((c) => (
            <button type="button" key={c} className={`option-card ${className === c ? 'selected' : ''}`} onClick={() => setClassName(c)}>
              <div className="name">{c} — {CLASS_TRAITS[c].name}</div>
              <div className="desc">{CLASSES[c].description}</div>
              <div className="desc trait-line">{CLASS_TRAITS[c].text}</div>
            </button>
          ))}
        </div>
      </div>
      </div>

      <button className="btn primary" disabled={!canBegin} onClick={() => dispatch({ type: 'CREATE_CHARACTER', name: name.trim(), race, className })}>
        Begin
      </button>
    </div>
  );
}
