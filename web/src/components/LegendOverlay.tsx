import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { MonsterImage } from '../art/MonsterImage';
import { play as sfx } from '../platform/sfx';

/**
 * PLAN3: generated history must LAND. When a famous beast finds you or a lost
 * artifact surfaces, the game stops and says so, full-screen.
 */
export function LegendOverlay({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const legend = state.pendingLegend;
  const world = state.world;
  if (!legend || !world) return null;

  if (legend.kind === 'beast') {
    const beast = world.beasts.find((b) => b.id === legend.beastId);
    if (!beast) return null;
    return (
      <div className="overlay legend-overlay">
        <div className="panel center-text">
          <p className="legend-kicker">A LEGEND WAKES</p>
          <div className="legend-art">
            <MonsterImage speciesId={beast.speciesId} size={220} rarity="Rare" boss />
          </div>
          <h1 className="title legend-name">
            {beast.name}
            <span className="legend-epithet">{beast.epithet}</span>
          </h1>
          <p className="story-paragraph">{beast.legend}</p>
          <p className="subtitle">It haunts the {GATES[beast.gateId].name}. Today it stopped haunting and started hunting.</p>
          <button
            className="btn danger"
            onClick={() => {
              sfx('dark');
              dispatch({ type: 'LEGEND_SEEN' });
            }}
          >
            Face it
          </button>
        </div>
      </div>
    );
  }

  const artifact = world.artifacts.find((a) => a.id === legend.artifactId);
  if (!artifact) return null;
  return (
    <div className="overlay legend-overlay">
      <div className="panel center-text">
        <p className="legend-kicker relic-kicker">A RELIC RETURNS TO THE LIGHT</p>
        <div className="relic-glyph">✦</div>
        <h1 className="title legend-name rarity-Legendary">{artifact.name}</h1>
        <p className="subtitle">{artifact.baseType} · lost beyond the {GATES[artifact.gateId].name}</p>
        <p className="story-paragraph">{artifact.description}</p>
        <button
          className="btn primary"
          onClick={() => {
            sfx('holy');
            dispatch({ type: 'LEGEND_SEEN' });
          }}
        >
          Take it up
        </button>
      </div>
    </div>
  );
}
