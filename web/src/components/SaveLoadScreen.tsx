import { useRef, useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import { isSavable } from '../engine/systems/saveGame';
import { SLOT_COUNT, saveToSlot, loadFromSlot, deleteSlot, getSlotSummary, exportSaveToFile, importSaveFromFile } from '../platform/browserSave';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import { useNavScope } from '../nav';
import '../sheets.css';

// v17 (PLAN7 C4): slots as save-crystal cards — gem, hero name, level, realm,
// timestamp — with export/import demoted to secondary actions. Presentation
// only; every handler is unchanged.

function formatDate(iso: string): string {
  if (!iso) return 'date unrecorded';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * A word about saves that do not match the running build. Older ones are
 * walked forward by the migration chain when loaded; newer ones cannot be
 * read at all, and the only cure is letting the PWA fetch its new bundle.
 */
function ageNote(age: 'older' | 'current' | 'later'): string | null {
  if (age === 'older') return 'From an older age — it will be carried forward.';
  if (age === 'later') return 'From a later age — reload Everdusk to read it.';
  return null;
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

  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'saveLoad',
    onCancel: () => {
      // backScreen, not 'town' — this screen is reachable from the floor
      // (FloorScreen's toolbar), and B must not walk anyone out of a run.
      dispatch({ type: 'GOTO', screen: backScreen });
      return true;
    },
  });

  // Open on Load for the first filled slot: a player who came here from the
  // floor is nearly always saving, but a player at the title is loading, and
  // the loading case is the one where landing on the wrong control costs them.
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
  const firstFilled = slots.find((slot) => !!getSlotSummary(slot));

  return (
    <div className="panel saveload-screen" ref={root}>
      <h1 className="title title-with-icon"><Icon name="save" size={26} emoji="" /> Save / Load</h1>
      <NpcHost npcId="fennick" state={state} />
      {!canSave && <p className="subtitle">Saving is only possible in town or while exploring (not mid-battle or mid-event).</p>}
      {message && <p className="sl-message">{message}</p>}

      <div className="sl-grid">
        {slots.map((slot) => {
          const summary = getSlotSummary(slot);
          return (
            <div key={slot} className={`sl-crystal ${summary ? 'filled' : 'empty'}`}>
              <div className="sl-gem" aria-hidden="true" />
              <div className="sl-slotnum">Slot {slot}</div>
              {summary ? (
                <>
                  <div className="sl-name">{summary.name}</div>
                  <div className="sl-meta">
                    Lv{summary.level} · {summary.where}
                  </div>
                  <div className="sl-meta">{summary.orbs}/4 orbs</div>
                  <div className="sl-date">{formatDate(summary.savedAt)}</div>
                  {ageNote(summary.age) && <div className="sl-date sl-age">{ageNote(summary.age)}</div>}
                </>
              ) : (
                <div className="sl-empty-label">(empty)</div>
              )}
              <div className="sl-actions">
                <button
                  className="btn small"
                  disabled={!canSave}
                  data-nav-initial={!firstFilled && slot === 1 ? '' : undefined}
                  aria-label={`Save to slot ${slot}`}
                  onClick={() => handleSave(slot)}
                >
                  Save
                </button>
                <button
                  className="btn small"
                  disabled={!summary}
                  data-nav-initial={slot === firstFilled ? '' : undefined}
                  aria-label={`Load slot ${slot}`}
                  onClick={() => handleLoad(slot)}
                >
                  Load
                </button>
                <button className="btn small danger" disabled={!summary} aria-label={`Delete slot ${slot}`} onClick={() => handleDelete(slot)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sl-io">
        <span className="sl-io-note">Carry a telling elsewhere:</span>
        <button
          className="btn small"
          disabled={!canSave}
          onClick={() => setMessage(exportSaveToFile(savableState) ? 'Save file downloaded.' : 'Cannot export right now.')}
        >
          ⬇️ Export to File
        </button>
        <button className="btn small" onClick={() => fileInputRef.current?.click()}>
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
