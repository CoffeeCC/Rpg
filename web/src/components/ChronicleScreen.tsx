import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { speciesById } from '../engine/data/species';
import { MonsterImage } from '../art/MonsterImage';
import { ChronicleText, type ChronRef } from './ChronicleText';
import { NpcHost } from './NpcHost';
import { loadTellings, loadFallenTellings, hasTriumphed } from '../platform/tellings';
import { PRESENT_TELLING_LINES, ordinal } from '../engine/data/tellingsLore';
import { TELLINGS_PREFACE_TITLE, TIMELINE_PREAMBLE, prefaceFor } from '../engine/data/retellingLore';
import { depthByLevel, faceableSpeciesCount } from '../engine/data/bindings';
import { ChroniclerPassage, MarginaliaList } from './BookPanel';
import { navItem, useNavScope, useRefocusOn } from '../nav';
import '../sheets.css';

// v17 (PLAN7 C5): the Chronicle reads like a tome — tab bar styled as book
// tabs riding the top edge of the page, entries as ledger lines with year
// pills. Presentation only; tab state and dispatches unchanged.

type Tab = 'timeline' | 'figures' | 'beasts' | 'artifacts' | 'deeds' | 'tellings' | 'marginalia';

const REF_TAB: Record<string, Tab> = { figure: 'figures', beast: 'beasts', artifact: 'artifacts' };

const TAB_ORDER: Tab[] = ['timeline', 'figures', 'beasts', 'artifacts', 'deeds', 'tellings', 'marginalia'];

export function ChronicleScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [focus, setFocus] = useState<ChronRef | null>(null);
  const world = state.world;

  // Shoulders turn the page. This is the one screen in the game with a real
  // tab bar, and LB/RB is where every console storefront puts lateral movement
  // between sections — reaching up to the bar and walking it with the D-pad
  // for every switch would be the wrong shape.
  const root = useRef<HTMLDivElement>(null);
  const stepTab = (delta: 1 | -1): boolean => {
    const next = TAB_ORDER[(TAB_ORDER.indexOf(tab) + delta + TAB_ORDER.length) % TAB_ORDER.length];
    setTab(next);
    // Take the cursor with it. Leaving the ring on the tab you just left means
    // pressing A jumps back, and pressing Down enters the wrong page.
    queueMicrotask(() => root.current?.querySelector<HTMLElement>(`[data-nav-key="chron-tab-${next}"]`)?.focus({ preventScroll: true }));
    return true;
  };

  /**
   * The page body is a scroll box 3000px tall inside a 400px window, and after
   * the prose links were demoted out of the ring it had no focusable children
   * at all — so a pad player could reach the tabs and the Back button and
   * never read a word past the first screenful.
   *
   * Making the box itself one focus stop fixes it with no new machinery: land
   * on it, and the triggers page it and the right stick free-scrolls it,
   * because both work off the focused element's nearest scroll container. It
   * announces as a group rather than a button — there is nothing to press.
   */
  const pageRegion = navItem({ role: 'group', key: 'chron-page', label: 'The page — triggers or the right stick to read on' });
  useNavScope(root, {
    id: 'chronicle',
    enabled: !!world,
    onButton: (button) => (button === 'prevTab' ? stepTab(-1) : button === 'nextTab' ? stepTab(1) : false),
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  // Changing tab replaces the entire page body, including whatever the cursor
  // was standing on — the audit filed this as a dropped-focus bug even for a
  // mouse user following an entity link across tabs.
  useRefocusOn([tab]);

  // After a reference click switches tabs, scroll its entry into view and flash it.
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`chron-entry-${focus.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('chron-focus');
      // restart the flash animation even when re-clicking the same entry
      void el.offsetWidth;
      el.classList.add('chron-focus');
    }
    const t = setTimeout(() => setFocus(null), 1600);
    return () => clearTimeout(t);
  }, [focus, tab]);

  if (!world) return null;

  const onRef = (ref: ChronRef) => {
    const target = REF_TAB[ref.kind];
    if (!target) return;
    setTab(target);
    setFocus(ref);
  };

  const meta = loadTellings();
  const fallen = loadFallenTellings();
  const triumphed = hasTriumphed(meta);
  const heroName = state.player?.name ?? 'the newcomer';
  const presentLine = PRESENT_TELLING_LINES[(meta.telling - 1) % PRESENT_TELLING_LINES.length]
    .replaceAll('{telling}', ordinal(meta.telling))
    .replaceAll('{name}', heroName);

  return (
    <div className="panel chronicle" ref={root}>
      <h1 className="title">The Chronicle of {world.name}</h1>
      <NpcHost npcId="chronicler" state={state} />

      <div className="chron-tabs" role="tablist">
        {(
          [
            ['timeline', '📜 Timeline'],
            ['figures', '🕯️ Figures'],
            ['beasts', '🐲 Beasts'],
            ['artifacts', '⚔️ Relics'],
            ['deeds', '✒️ Your Deeds'],
            ['tellings', '📖 The Tellings'],
            ['marginalia', '🖋 Marginalia'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`chron-tab ${tab === id ? 'on' : ''}`}
            data-nav-initial={tab === id ? '' : undefined}
            data-nav-key={`chron-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="chron-page">
      {tab === 'timeline' && (
        <div className="chronicle-scroll" {...pageRegion}>
          {/* The one line that reconciles generated world history with the
              retelling frame: the deep past is regenerated every telling, and
              until now nothing told the player that was on purpose. */}
          <p className="chronicle-line timeline-preamble">{TIMELINE_PREAMBLE}</p>
          {world.eras.map((era) => (
            <div key={era.name}>
              <h2 className="title era-heading">{era.name} <span className="pill">{era.startYear}–{era.endYear}</span></h2>
              {world.events
                .filter((e) => e.year >= era.startYear && e.year <= era.endYear)
                .map((e, i) => (
                  <p className="chronicle-line" key={i}>
                    <span className="chronicle-year">{e.year}</span> <ChronicleText text={e.text} world={world} onRef={onRef} />
                  </p>
                ))}
            </div>
          ))}

          <h2 className="title era-heading">
            The Present Telling <span className="pill">now</span>
          </h2>
          <p className="chronicle-line present-telling-line">{presentLine}</p>
          {fallen.map((f) => (
            <p className="chronicle-line struck-telling" key={f.telling}>
              <span className="chronicle-year">✗</span> <s>{f.epitaph}</s>
            </p>
          ))}
          {state.chronicle.deeds.slice(-6).map((d, i) => (
            <p className="chronicle-line deed-line" key={`deed-${i}`}>
              <span className="chronicle-year">now</span> <ChronicleText text={d.text} world={world} onRef={onRef} />
            </p>
          ))}
        </div>
      )}

      {tab === 'figures' && (
        <div className="chronicle-scroll" {...pageRegion}>
          {world.figures.map((f) => {
            const mentor = world.figures.find((m) => m.id === f.mentorId);
            const rival = world.figures.find((r) => r.id === f.rivalId);
            const slayer = world.beasts.find((b) => b.id === f.slainByBeastId);
            const threads = [
              mentor && `Studied under ${mentor.name} ${mentor.title}.`,
              rival && `Rival of ${rival.name} ${rival.title}.`,
              slayer && `Slain by ${slayer.name} ${slayer.epithet}.`,
            ].filter((t): t is string => !!t);
            return (
              <div className="chronicle-entry" id={`chron-entry-${f.id}`} key={f.id}>
                <b>{f.name} {f.title}</b> <span className="pill">{f.role}</span>
                <div className="affix-line">
                  {f.bornYear} — {f.diedYear ?? '?'} · <ChronicleText text={f.fate} world={world} onRef={onRef} />
                </div>
                {threads.length > 0 && (
                  <div className="affix-line figure-threads">
                    <ChronicleText text={threads.join(' ')} world={world} onRef={onRef} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'beasts' && (
        <div className="chronicle-scroll" {...pageRegion}>
          {world.beasts.map((b) => {
            const slain = state.chronicle.beastsSlain.includes(b.id);
            const species = speciesById(b.speciesId);
            return (
              <div className="chronicle-entry beast-entry" id={`chron-entry-${b.id}`} key={b.id}>
                <div className="beast-portrait">
                  <MonsterImage speciesId={b.speciesId} size={84} rarity="Rare" />
                </div>
                <div>
                  <b>{b.name}, {b.epithet}</b> {slain && <span className="pill slain-pill">SLAIN</span>}
                  <div className="affix-line">
                    {species?.name ?? b.speciesId} · haunts the {GATES[b.gateId].name}
                  </div>
                  <div className="chronicle-line">
                    <ChronicleText text={b.legend} world={world} onRef={onRef} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'artifacts' && (
        <div className="chronicle-scroll" {...pageRegion}>
          {world.artifacts.map((a) => {
            const found = state.chronicle.artifactsFound.includes(a.id);
            const holder = world.beasts.find((b) => b.holdsArtifactId === a.id);
            return (
              <div className="chronicle-entry" id={`chron-entry-${a.id}`} key={a.id}>
                <b className={found ? 'rarity-Legendary' : ''}>{a.name}</b>{' '}
                <span className="pill">{a.baseType}</span>{' '}
                {found ? (
                  <span className="pill slain-pill">RECOVERED</span>
                ) : (
                  <span className="pill">
                    {holder ? `held by something in the ${GATES[holder.gateId].name}` : `lost in the ${GATES[a.gateId].name}`}
                  </span>
                )}
                <div className="chronicle-line">
                  <ChronicleText text={a.description} world={world} onRef={onRef} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'deeds' && (
        <div className="chronicle-scroll" {...pageRegion}>
          <p className="chronicle-line present-telling-line">{presentLine}</p>
          {fallen.length > 0 && (
            <>
              {fallen.map((f) => (
                <p className="chronicle-line struck-telling" key={f.telling}>
                  <span className="chronicle-year">✗</span> <s>{f.epitaph}</s>
                </p>
              ))}
            </>
          )}
          {state.chronicle.deeds.length === 0 && (
            <p className="subtitle">The page with your name on it is still blank. The Chronicle is patient.</p>
          )}
          {state.chronicle.deeds.map((d, i) => (
            <p className="chronicle-line deed-line" key={i}>
              <span className="chronicle-year">{d.year}</span> <ChronicleText text={d.text} world={world} onRef={onRef} />
            </p>
          ))}
        </div>
      )}

      {/* The permanent home of the retelling fiction. The Fallen screen
          delivers this once, at the moment it matters; this is where a player
          who wants it again, or wants the rest of it, can always find it. */}
      {tab === 'tellings' && (
        <div className="chronicle-scroll" {...pageRegion}>
          <h2 className="title era-heading">{TELLINGS_PREFACE_TITLE}</h2>
          <ChroniclerPassage paragraphs={prefaceFor(triumphed)} />

          <h2 className="title era-heading">
            The Standing Record <span className="pill">across every telling</span>
          </h2>
          <p className="chronicle-line">
            Tellings begun: <b>{meta.telling}</b> · struck through: <b>{fallen.length}</b> · endings reached:{' '}
            <b>{meta.triumphs.length}</b>
          </p>
          <p className="chronicle-line">
            Species faced: <b>{Math.min(meta.ledger.species.length, faceableSpeciesCount())}/{faceableSpeciesCount()}</b>{' '}
            · Wardens felled: <b>{meta.ledger.wardens.length}/4</b>
            {triumphed && (
              <>
                {' '}
                · deepest reading carried to the end: <b>{depthByLevel(meta.ledger.deepest).name}</b>
              </>
            )}
          </p>
          <p className="subtitle">Verses banked: ✒️ {meta.verses}. The Chronicler keeps his desk at the tavern.</p>

          <h2 className="title era-heading">
            The Drafts <span className="pill">kept, not discarded</span>
          </h2>
          <p className="chronicle-line present-telling-line">{presentLine}</p>
          {fallen.length === 0 && meta.triumphs.length === 0 && (
            <p className="subtitle">
              Nothing has been struck through yet. The Chronicler has ruled the page and is waiting to find out what
              kind of page it is.
            </p>
          )}
          {fallen
            .slice()
            .reverse()
            .map((f) => (
              <p className="chronicle-line struck-telling" key={`t-${f.telling}`}>
                <span className="chronicle-year">✗</span> <s>{f.epitaph}</s>
              </p>
            ))}
          {meta.triumphs.length > 0 && (
            <>
              <h2 className="title era-heading">
                The Shorter Shelf <span className="pill">endings</span>
              </h2>
              {meta.triumphs
                .slice()
                .reverse()
                .map((t) => (
                  <p className="chronicle-line" key={`v-${t.telling}-${t.name}`}>
                    <span className="chronicle-year">✓</span> {t.line}
                    {t.depth > 0 && <> — {depthByLevel(t.depth).name}</>}
                  </p>
                ))}
            </>
          )}
        </div>
      )}

      {/* Everdusk has no tutorial, no help screen and no glossary. This is it:
          the Chronicler's annotations on the practical business of a telling,
          each entry said once in voice and once plainly. */}
      {tab === 'marginalia' && (
        <div className="chronicle-scroll" {...pageRegion}>
          <p className="chronicle-line timeline-preamble">
            Notes made in the margins over a long time, for a reader the Chronicler has not met. Each is written twice:
            once as it is meant, and once as it is.
          </p>
          <MarginaliaList triumphed={triumphed} />
        </div>
      )}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Close the book
        </button>
      </div>
    </div>
  );
}
