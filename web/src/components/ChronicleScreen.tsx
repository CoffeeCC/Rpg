import { useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { speciesById } from '../engine/data/species';
import { MonsterImage } from '../art/MonsterImage';

type Tab = 'timeline' | 'figures' | 'beasts' | 'artifacts' | 'deeds';

export function ChronicleScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [tab, setTab] = useState<Tab>('timeline');
  const world = state.world;
  if (!world) return null;

  return (
    <div className="panel chronicle">
      <h1 className="title">The Chronicle of {world.name}</h1>
      <p className="subtitle">What the realm remembers. What it will remember of you.</p>

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
                    <span className="chronicle-year">{e.year}</span> {e.text}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'figures' && (
        <div className="chronicle-scroll">
          {world.figures.map((f) => (
            <div className="chronicle-entry" key={f.id}>
              <b>{f.name} {f.title}</b> <span className="pill">{f.role}</span>
              <div className="affix-line">
                {f.bornYear} — {f.diedYear ?? '?'} · {f.fate}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'beasts' && (
        <div className="chronicle-scroll">
          {world.beasts.map((b) => {
            const slain = state.chronicle.beastsSlain.includes(b.id);
            const species = speciesById(b.speciesId);
            return (
              <div className="chronicle-entry beast-entry" key={b.id}>
                <div className="beast-portrait">
                  <MonsterImage speciesId={b.speciesId} size={84} rarity="Rare" />
                </div>
                <div>
                  <b>{b.name}, {b.epithet}</b> {slain && <span className="pill slain-pill">SLAIN</span>}
                  <div className="affix-line">
                    {species?.name ?? b.speciesId} · haunts the {GATES[b.gateId].name}
                  </div>
                  <div className="chronicle-line">{b.legend}</div>
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
              <div className="chronicle-entry" key={a.id}>
                <b className={found ? 'rarity-Legendary' : ''}>{a.name}</b>{' '}
                <span className="pill">{a.baseType}</span>{' '}
                {found ? (
                  <span className="pill slain-pill">RECOVERED</span>
                ) : (
                  <span className="pill">
                    {holder ? `held by something in the ${GATES[holder.gateId].name}` : `lost in the ${GATES[a.gateId].name}`}
                  </span>
                )}
                <div className="chronicle-line">{a.description}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'deeds' && (
        <div className="chronicle-scroll">
          {state.chronicle.deeds.length === 0 && (
            <p className="subtitle">The page with your name on it is still blank. The Chronicle is patient.</p>
          )}
          {state.chronicle.deeds.map((d, i) => (
            <p className="chronicle-line deed-line" key={i}>
              <span className="chronicle-year">{d.year}</span> {d.text}
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
