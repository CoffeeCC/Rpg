import { useState } from 'react';
import {
  CARRIED_OVER,
  CARRY_HEADINGS,
  NOT_CARRIED,
  TELLINGS_PREFACE_TITLE,
  marginaliaFor,
  prefaceFor,
} from '../engine/data/retellingLore';
import '../retelling.css';

// ---------------------------------------------------------------------------
// The reusable surfaces for the retelling fiction. Presentation only: nothing
// here reads or writes game state, and nothing here dispatches. Mounted by
// FallenScreen, VictoryScreen, TavernScreen, StoryOverlay and ChronicleScreen.
//
// Everything interactive is a real <button> with aria-expanded, and no fact is
// carried by a title= tooltip alone — a controller/Steam Deck navigation pass
// is underway and this should not add work to it.
// ---------------------------------------------------------------------------

/** Paragraphs the Chronicler is speaking. A leading "[margin note]" drops the
 *  line half a step quieter, the way the voice bible says it should. */
export function ChroniclerPassage({ paragraphs, className = '' }: { paragraphs: string[]; className?: string }) {
  return (
    <div className={`chronicler-passage ${className}`.trim()}>
      {paragraphs.map((p, i) => {
        const isMargin = p.startsWith('[margin note]');
        return (
          <p className={isMargin ? 'chronicler-margin' : 'chronicler-line-p'} key={i}>
            {isMargin ? p.slice('[margin note]'.length).trim() : p}
          </p>
        );
      })}
    </div>
  );
}

/** The plain accounting of what a death costs and what it does not. The one
 *  place the fiction stands aside far enough to be checked against the code. */
export function CarryLedger() {
  return (
    <div className="carry-ledger">
      <div className="carry-col carry-kept">
        <h3 className="carry-heading">{CARRY_HEADINGS.kept}</h3>
        <ul>
          {CARRIED_OVER.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="carry-col carry-lost">
        <h3 className="carry-heading">{CARRY_HEADINGS.lost}</h3>
        <ul>
          {NOT_CARRIED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The canonical account of the book, folded away until asked for. The player
 *  who wants it can have all of it; the player who does not is never handed it. */
export function PrefaceDisclosure({ triumphed, startOpen = false }: { triumphed: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="preface-block">
      <button type="button" className="btn small preface-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Close the preface' : 'Ask what the book is for'}
      </button>
      {open && (
        <div className="preface-body">
          <h3 className="draft-heading">{TELLINGS_PREFACE_TITLE}</h3>
          <ChroniclerPassage paragraphs={prefaceFor(triumphed)} />
        </div>
      )}
    </div>
  );
}

/** The glossary. Every entry says the true thing twice: once as the Chronicler
 *  would say it, once flatly. The flat half is the character's own margin-note
 *  form, which is the only reason this can be both honest and in voice. */
export function MarginaliaList({ triumphed }: { triumphed: boolean }) {
  return (
    <div className="marginalia-list">
      {marginaliaFor(triumphed).map((entry) => (
        <div className="margin-entry" key={entry.id}>
          <b className="margin-title">{entry.title}</b>
          <p className="margin-note-prose">{entry.note}</p>
          <p className="margin-plain">
            <span className="margin-plain-tag">margin note</span> {entry.plain}
          </p>
        </div>
      ))}
    </div>
  );
}
