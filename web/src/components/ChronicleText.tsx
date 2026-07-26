import { useMemo, type ReactNode } from 'react';
import type { GeneratedWorld } from '../engine/types';
import { GATES, GATE_ORDER } from '../engine/data/gates';

// Entity-aware chronicle prose: every generated name (figure, beast, artifact,
// gate) the history mentions becomes a live reference — click it to jump to
// its entry. This is what turns the timeline from a wall of text into a hub.

export type ChronRefKind = 'figure' | 'beast' | 'artifact' | 'gate';
export interface ChronRef {
  kind: ChronRefKind;
  id: string;
}

interface NamePattern {
  name: string;
  kind: ChronRefKind;
  id: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** All matchable entity names for a world, longest-first so "Vess the Unfed"
 * wins over bare "Vess" and full figure names win over shared surnames. */
function buildPatterns(world: GeneratedWorld): NamePattern[] {
  const patterns: NamePattern[] = [];
  for (const f of world.figures) {
    patterns.push({ name: `${f.name} ${f.title}`, kind: 'figure', id: f.id });
  }
  for (const b of world.beasts) {
    patterns.push({ name: `${b.name} ${b.epithet}`, kind: 'beast', id: b.id });
    patterns.push({ name: b.name, kind: 'beast', id: b.id });
  }
  for (const a of world.artifacts) {
    patterns.push({ name: a.name, kind: 'artifact', id: a.id });
  }
  for (const gateId of GATE_ORDER) {
    patterns.push({ name: GATES[gateId].name, kind: 'gate', id: gateId });
  }
  patterns.sort((a, b) => b.name.length - a.name.length);
  return patterns;
}

/** Renders chronicle prose with entity names as clickable highlights.
 * `onRef` fires when a linkable entity is clicked (gates render as passive
 * highlights — they have no entry page to jump to). */
export function ChronicleText({
  text,
  world,
  onRef,
}: {
  text: string;
  world: GeneratedWorld;
  onRef?: (ref: ChronRef) => void;
}) {
  const { regex, byName } = useMemo(() => {
    const patterns = buildPatterns(world);
    const byName = new Map<string, NamePattern>();
    for (const p of patterns) if (!byName.has(p.name)) byName.set(p.name, p);
    const regex = new RegExp(patterns.map((p) => escapeRegex(p.name)).join('|'), 'g');
    return { regex, byName };
  }, [world]);

  const nodes: ReactNode[] = [];
  let last = 0;
  regex.lastIndex = 0;
  for (const m of text.matchAll(regex)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const p = byName.get(m[0]);
    if (!p) {
      nodes.push(m[0]);
    } else if (p.kind === 'gate' || !onRef) {
      nodes.push(
        <span key={`${idx}-${p.id}`} className={`chron-ref chron-ref-${p.kind}`}>
          {m[0]}
        </span>,
      );
    } else {
      nodes.push(
        // `data-nav-skip` demotes these out of the CONTROLLER's ring. A full
        // timeline turns into a hundred-odd inline buttons, and a D-pad walk
        // through flowing prose that stops on every proper noun is not a
        // navigation model — it is a punishment. They keep their tabIndex, so
        // Tab, screen readers and the mouse still reach every one, and nothing
        // is unreachable either way: every entity these link to also has its
        // own row under the Figures / Beasts / Relics tabs.
        <button
          key={`${idx}-${p.id}`}
          className={`chron-ref chron-ref-${p.kind} chron-ref-link`}
          data-nav-skip=""
          onClick={() => onRef({ kind: p.kind, id: p.id })}
        >
          {m[0]}
        </button>,
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return <>{nodes}</>;
}
