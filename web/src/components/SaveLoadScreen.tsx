import { useRef, useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import { isSavable } from '../engine/systems/saveGame';
import { SLOT_COUNT, saveToSlot, loadFromSlot, deleteSlot, getSlotSummary, exportSaveToFile, importSaveFromFile } from '../platform/browserSave';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function SaveLoadScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const [, setTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // While this screen is up, state.screen is 'saveLoad' - not itself a save
  // point. The snapshot substitutes backScreen (town/floor), which is where
  // the player will resume.
  const savableState: GameState = { ...state, screen: backScreen };
  const canSave = isSavable(savableState);

  function handleSave(slot: number) {
    const ok = saveToSlot(slot, savableState);
    setMessage(ok ? `Saved to slot ${slot}.` : 'Cannot save right now.');
    setTick((n) => n + 1);
  }

  function handleLoad(slot: number) {
    const result = loadFromSlot(slot);
    if (typeof result === 'string') {
      setMessage(result);
      return;
    }
    dispatch({ type: 'LOAD_STATE', state: result });
  }

  function handleDelete(slot: number) {
    deleteSlot(slot);
    setMessage(`Cleared slot ${slot}.`);
    setTick((n) => n + 1);
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
    <div className="panel">
      <h1 className="title">💾 Save / Load</h1>
      {!canSave && <p className="subtitle">Saving is only possible in town or while exploring (not mid-battle or mid-event).</p>}
      {message && <p className="subtitle">{message}</p>}

      <div className="option-list">
        {Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((slot) => {
          const summary = getSlotSummary(slot);
          return (
            <div key={slot} className="item-row">
              <div className="item-desc">
                <b>Slot {slot}</b>
                <div className="affix-line">
                  {summary
                    ? `${summary.name} · Lv${summary.level} · ${summary.where} · ${summary.orbs}/4 orbs · ${formatDate(summary.savedAt)}`
                    : '(empty)'}
                </div>
              </div>
              <button className="btn small" disabled={!canSave} onClick={() => handleSave(slot)}>
                Save
              </button>
              <button className="btn small" disabled={!summary} onClick={() => handleLoad(slot)}>
                Load
              </button>
              <button className="btn small danger" disabled={!summary} onClick={() => handleDelete(slot)}>
                Delete
              </button>
            </div>
          );
        })}
      </div>

      <div className="btn-row">
        <button className="btn" disabled={!canSave} onClick={() => setMessage(exportSaveToFile(savableState) ? 'Save file downloaded.' : 'Cannot export right now.')}>
          ⬇️ Export to File
        </button>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>
          ⬆️ Import from File
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
