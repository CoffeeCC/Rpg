import { useState } from 'react';
import { KEYWORDS } from '../engine/data/keywords';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first so 'Magic Defense' matches whole rather than 'Magic'
// (not itself a keyword, but guards against any future overlap the same way).
const KEYWORD_NAMES = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);
const KEYWORD_RE = new RegExp(`\\b(${KEYWORD_NAMES.map(escapeRegExp).join('|')})\\b`, 'g');

function Keyword({ term }: { term: string }) {
  const info = KEYWORDS[term];
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`keyword keyword-${info.category}`}
      tabIndex={0}
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
 * over hand-written flavor text risks false hits on ordinary words. */
export function KeywordText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  KEYWORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KEYWORD_RE.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<Keyword key={i++} term={match[0]} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
