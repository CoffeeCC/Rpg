import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/game';
import {
  bindingUnlocked,
  bindingWritten,
  hasTriumphed,
  inscribeBinding,
  offeredDepth,
  recordLedger,
  setBinding,
  setDepth,
  type TellingsMeta,
} from '../platform/tellings';
import { BINDINGS, DEPTHS, bindingById, depthByLevel, faceableSpeciesCount } from '../engine/data/bindings';
import { CHRONICLER_DEPTH_LINES, CHRONICLER_DRAFT_LINES, ordinal } from '../engine/data/tellingsLore';
import { GATES } from '../engine/data/gates';
import { play as sfx } from '../platform/sfx';
import './nextDraft.css';

// Only species a gate can actually spawn: a chase goal you cannot finish is
// worse than no chase goal. See faceableSpeciesCount() for why not all of them.
const SPECIES_TOTAL = faceableSpeciesCount();
const WARDEN_TOTAL = Object.keys(GATES).length;

/**
 * The Chronicler's second ledger: the standing record of what every telling
 * has shown them, and the premise they will write into the next one.
 *
 * Lives inside the Tavern rather than on a screen of its own because the
 * Tavern is where the desk already is — and because App.tsx's routing belongs
 * to another owner. Every unlock in this system is visible from here, met or
 * unmet, so nothing the player earns can go unnoticed.
 */
export function NextDraftPanel({
  state,
  meta,
  setMeta,
}: {
  state: GameState;
  meta: TellingsMeta;
  setMeta: (m: TellingsMeta) => void;
}) {
  const flushed = useRef('');

  // Fold this telling's discoveries into the standing record. recordLedger is
  // a set-union, so StrictMode's double-invocation is a no-op, and the ref
  // only exists to keep us off localStorage on every unrelated re-render.
  useEffect(() => {
    const species = state.discovered ?? [];
    const wardens = state.defeatedBosses;
    const stamp = `${species.length}:${wardens.length}`;
    if (flushed.current === stamp) return;
    flushed.current = stamp;
    if (!species.length && !wardens.length) return;
    setMeta(recordLedger({ species, wardens }));
    // setMeta is stable enough here: TavernScreen holds it in useState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.discovered, state.defeatedBosses]);

  const nowBinding = bindingById(state.binding);
  const nowDepth = depthByLevel(state.depth);
  const nextBinding = bindingById(meta.binding);
  const nextDepth = depthByLevel(meta.depth);
  const canDepth = hasTriumphed(meta);
  const maxOffered = offeredDepth(meta);

  const speciesSeen = meta.ledger.species.length;
  const wardensFelled = meta.ledger.wardens.length;

  // A depth chip renders one character — "Surface 1 2 3 4 5" — and everything
  // that makes it mean anything used to live in a native `title`. `title`
  // fires on hover only: on a Deck, with no mouse, it never fires at all, so a
  // controller player was choosing between six unlabelled numbers.
  //
  // The terms line below the row now previews whichever chip the cursor is on
  // — focus OR hover, so pad, keyboard and mouse all get the same reading —
  // and falls back to the standing choice when the cursor is elsewhere. The
  // `title` stays for mouse users who are used to it.
  const [previewDepth, setPreviewDepth] = useState<number | null>(null);
  const shownDepth = previewDepth === null ? nextDepth : depthByLevel(previewDepth);
  const previewing = previewDepth !== null && previewDepth !== meta.depth;

  return (
    <div className="next-draft">
      <h2 className="title" style={{ fontSize: '1rem' }}>
        📖 The Standing Record
      </h2>
      <p className="subtitle chronicler-desk-line">
        {canDepth
          ? CHRONICLER_DEPTH_LINES[(meta.triumphs.length + meta.telling) % CHRONICLER_DEPTH_LINES.length]
          : CHRONICLER_DRAFT_LINES[(meta.telling + speciesSeen) % CHRONICLER_DRAFT_LINES.length]}
      </p>

      <div className="record-grid">
        <RecordTile
          label="Species faced"
          value={`${Math.min(speciesSeen, SPECIES_TOTAL)}/${SPECIES_TOTAL}`}
          note="across every telling"
        />
        <RecordTile label="Wardens felled" value={`${wardensFelled}/${WARDEN_TOTAL}`} note="across every telling" />
        <RecordTile label="Tellings told" value={String(meta.telling)} note={`${meta.fallen.length} struck through`} />
        <RecordTile
          label="Endings reached"
          value={String(meta.triumphs.length)}
          note={meta.triumphs.length ? `deepest: ${depthByLevel(meta.ledger.deepest).name}` : 'the book is still open'}
        />
      </div>

      {/* What the telling you are inside right now was written under. Read-only
          on purpose: the premise is fixed at the moment the hero is made. */}
      <p className="subtitle draft-now">
        {nowBinding || nowDepth.depth > 0 ? (
          <>
            This {ordinal(meta.telling)} telling is bound: <b>{nowBinding ? nowBinding.name : 'An Unbound Telling'}</b>
            {nowDepth.depth > 0 ? <>, read at <b>{nowDepth.name}</b></> : null}. The premise was set when you began; the
            Chronicler will not revise a draft that is still being lived in.
          </>
        ) : (
          <>This telling runs unbound — the story plain, as it was first set down. What you choose below binds the next one.</>
        )}
      </p>

      <h3 className="draft-heading">The Next Draft</h3>
      <p className="subtitle draft-sub">
        Inscribed now, begun when the next hero does. Standing premise: <b>{nextBinding ? nextBinding.name : 'An Unbound Telling'}</b>
        {nextDepth.depth > 0 ? <> at <b>{nextDepth.name}</b></> : null}.
      </p>

      <div className="option-list ledger-list">
        <button
          type="button"
          className={`ledger-row draft-row${meta.binding === null ? ' chosen' : ''}`}
          onClick={() => {
            sfx('uiClick');
            setMeta(setBinding(null));
          }}
        >
          <div className="ledger-row-body">
            <b className="ledger-name">An Unbound Telling</b>
            {meta.binding === null && <span className="pill slain-pill">standing</span>}
            <div className="affix-line">
              No pact and no premise. The Chronicler writes it plain, the way it was first written — and the way it has
              not once, so far, ended well.
            </div>
          </div>
        </button>

        {BINDINGS.map((binding) => {
          const written = bindingWritten(binding, meta);
          const eligible = bindingUnlocked(binding, meta);
          const chosen = meta.binding === binding.id;
          const affordable = meta.verses >= binding.cost;
          const cls = written ? (chosen ? ' chosen' : '') : eligible ? (affordable ? '' : ' cant') : ' locked';
          return (
            <button
              type="button"
              key={binding.id}
              className={`ledger-row draft-row${cls}`}
              disabled={!written && !(eligible && affordable)}
              onClick={() => {
                sfx('uiClick');
                if (written) setMeta(setBinding(binding.id));
                else {
                  const updated = inscribeBinding(binding.id);
                  if (updated) setMeta(updated);
                }
              }}
            >
              <div className="ledger-row-body">
                <b className="ledger-name">{binding.name}</b>
                {chosen && <span className="pill slain-pill">standing</span>}
                {!written && eligible && <span className="pill draft-pill">unwritten</span>}
                {!written && !eligible && <span className="pill draft-pill locked-pill">sealed</span>}
                <div className="affix-line">{binding.text}</div>
                <div className="draft-terms">{binding.terms}</div>
                {!written && !eligible && <div className="draft-req">{binding.requirementText}</div>}
              </div>
              {!written && eligible && (
                <div className="svc-buy">
                  <span className="price-chip verse-chip" title="Cost in verses">
                    ✒️ {binding.cost}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {canDepth ? (
        <div className="depth-block">
          <h3 className="draft-heading">The Reading</h3>
          <p className="subtitle draft-sub">
            {nextDepth.text}
            {maxOffered < DEPTHS.length - 1 && (
              <>
                {' '}
                The Chronicler will not offer a deeper reading than the one below the deepest you have carried to the end.
              </>
            )}
          </p>
          <div className="depth-row">
            {DEPTHS.map((d) => {
              const reachable = d.depth <= maxOffered;
              return (
                <button
                  type="button"
                  key={d.depth}
                  className={`depth-chip${meta.depth === d.depth ? ' chosen' : ''}${reachable ? '' : ' locked'}`}
                  disabled={!reachable}
                  title={reachable ? `${d.name} — ${d.terms}` : 'Carry the reading above this one to the end first.'}
                  aria-label={reachable ? `${d.name}. ${d.terms}` : `${d.name}, sealed. Carry the reading above this one to the end first.`}
                  onFocus={() => setPreviewDepth(d.depth)}
                  onBlur={() => setPreviewDepth((cur) => (cur === d.depth ? null : cur))}
                  onMouseEnter={() => setPreviewDepth(d.depth)}
                  onMouseLeave={() => setPreviewDepth((cur) => (cur === d.depth ? null : cur))}
                  onClick={() => {
                    sfx('uiClick');
                    setMeta(setDepth(d.depth));
                  }}
                >
                  {d.depth === 0 ? 'Surface' : `${d.depth}`}
                </button>
              );
            })}
          </div>
          <div className="draft-terms depth-terms">
            <b>{shownDepth.name}.</b> {shownDepth.terms}
            {previewing && <span className="depth-preview-note"> — not yet inscribed.</span>}
          </div>
        </div>
      ) : (
        <p className="subtitle draft-sub depth-sealed">
          There are readings beneath this one. The Chronicler does not mention them, and would not, until the book has
          been read all the way through at least once.
        </p>
      )}

      {meta.triumphs.length > 0 && (
        <div className="triumph-block">
          <h3 className="draft-heading">The Shorter Shelf</h3>
          {meta.triumphs
            .slice()
            .reverse()
            .slice(0, 4)
            .map((t) => (
              <p className="triumph-line" key={`${t.telling}-${t.name}`}>
                {t.line}
                {t.depth > 0 && <span className="triumph-depth"> — {depthByLevel(t.depth).name}</span>}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

function RecordTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="record-tile">
      <span className="record-value">{value}</span>
      <span className="record-label">{label}</span>
      <span className="record-note">{note}</span>
    </div>
  );
}
