import { useState } from 'react';
import { KEYWORDS } from '../engine/data/keywords';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first so 'Magic Defense' matches whole rather than 'Magic'
// (not itself a keyword, but guards against any future overlap the same way).
const KEYWORD_NAMES = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);
const KEYWORD_RE = new RegExp(`\\b(${KEYWORD_NAMES.map(escapeRegExp).join('|')})\\b`, 'g');

function Keyword({ term, navigable }: { term: string; navigable: boolean }) {
  const info = KEYWORDS[term];
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`keyword keyword-${info.category}`}
      tabIndex={0}
      // Demoted to a secondary ring unless the caller asks otherwise. Every
      // glossary term in a paragraph is its own focus stop, which on the
      // character sheet is forty to eighty of them — a D-pad walk through
      // prose, stopping on each proper noun, and the screen becomes unusable.
      // `data-nav-skip` takes them out of the CONTROLLER's ring only: they
      // keep tabIndex 0, so Tab and screen readers still reach every one.
      // Screens where the terms are the point (the card inspector) pass
      // `navigable` and get them back.
      data-nav-skip={navigable ? undefined : ''}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      {term}
      {open && (
        <span className="keyword-tooltip" role="tooltip">
          <strong>{term}</strong>
          <span>{info.description}</span>
        </span>
      )}
    </span>
  );
}

/** Highlights every known glossary term (statuses, stats, mechanics — see
 * engine/data/keywords) in a plain string, each one hoverable/tappable for a
 * plain-language explanation. Only meant for mechanically-generated text
 * (effect descriptions) where every match is a real keyword; running this
 * over hand-written flavor text risks false hits on ordinary words.
 *
 * `navigable` puts the terms in the controller's focus ring. Off by default —
 * see the note on `Keyword`. Turn it on where the terms ARE the content, as
 * `CardDetailOverlay` does: a card's rules text is four lines, and being able
 * to ask what "Exhaust" means is the whole reason that overlay exists. */
export function KeywordText({ text, navigable = false }: { text: string; navigable?: boolean }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  KEYWORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KEYWORD_RE.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<Keyword key={i++} term={match[0]} navigable={navigable} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
