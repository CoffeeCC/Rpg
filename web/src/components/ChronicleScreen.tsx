import { useEffect, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { speciesById } from '../engine/data/species';
import { MonsterImage } from '../art/MonsterImage';
import { ChronicleText, type ChronRef } from './ChronicleText';
import { NpcHost } from './NpcHost';
import { loadTellings, loadFallenTellings } from '../platform/tellings';
import { PRESENT_TELLING_LINES, ordinal } from '../engine/data/tellingsLore';

type Tab = 'timeline' | 'figures' | 'beasts' | 'artifacts' | 'deeds';

const REF_TAB: Record<string, Tab> = { figure: 'figures', beast: 'beasts', artifact: 'artifacts' };

export function ChronicleScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [focus, setFocus] = useState<ChronRef | null>(null);
  const world = state.world;

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
  const heroName = state.player?.name ?? 'the newcomer';
  const presentLine = PRESENT_TELLING_LINES[(meta.telling - 1) % PRESENT_TELLING_LINES.length]
    .replaceAll('{telling}', ordinal(meta.telling))
    .replaceAll('{name}', heroName);

  return (
    <div className="panel chronicle">
      <h1 className="title">The Chronicle of {world.name}</h1>
      <NpcHost npcId="chronicler" state={state} />

      <div className="btn-row">
        {(
          [
            ['timeline', '📜 Timeline'],
            ['figures', '🕯️ Figures'],
            ['beasts', '🐲 Beasts'],
            ['artifacts', '⚔️ Relics'],
            ['deeds', '✒️ Your Deeds'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`btn small ${tab === id ? 'primary' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && (
        <div className="chronicle-scroll">
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
        <div className="chronicle-scroll">
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
        <div className="chronicle-scroll">
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
        <div className="chronicle-scroll">
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
        <div className="chronicle-scroll">
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

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Close the book
        </button>
      </div>
    </div>
  );
}
