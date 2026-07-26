import { useRef, useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import { availableQuests, restCost } from '../engine/game';
import { Icon } from './Icon';
import { PAINTED_TOWN } from '../art/painted';
import { PAINTED_NPCS } from '../art/paintedCharacters';
import { NpcPortrait } from '../art/npcArt';
import { pickBark } from './NpcHost';
import { useNavScope } from '../nav';
import '../services.css';

// v10: the town is people, not buttons. World services hang off the person
// who runs them; only self-management (you, gates, save) stays as a strip.

interface CastEntry {
  npcId: string;
  name: string;
  role: string;
  emoji: string;
  services: { label: string; screen: Screen; badge?: boolean; badgeTitle?: string }[];
}

export function TownScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  // The hub. B is deliberately unbound: town IS the back target, and a stray
  // press here must not walk anyone anywhere. The scope id gives focus memory,
  // so coming back from the stable puts the cursor on the stable again.
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, { id: 'town' });

  // v18.11: the town painting is a large JPEG that used to decode into a void
  // of raw panel-black. The backdrop div carries a dusk gradient underneath,
  // and the painting cross-fades in once it has actually loaded.
  const [sceneReady, setSceneReady] = useState(false);
  const questsNew = availableQuests(state).length > state.seen.questCount;
  const questsClaimable = state.questLog.some((q) => q.complete && !q.claimed);
  const tavernNew = state.storyChapter > state.seen.tavernChapter;

  const cast: CastEntry[] = [
    {
      npcId: 'ott',
      name: 'Stablemaster Ott',
      role: 'Stablemaster',
      emoji: '🐴',
      services: [
        { label: 'The stable', screen: 'stable' },
        { label: 'Breeding', screen: 'breeding' },
      ],
    },
    {
      npcId: 'grude',
      name: 'Smith Grude',
      role: 'Smith',
      emoji: '🔨',
      services: [
        { label: 'The forge', screen: 'smith' },
        { label: 'Gear stall', screen: 'shopGear' },
      ],
    },
    {
      npcId: 'maribel',
      name: 'Old Maribel',
      role: 'Keeper of the Lost',
      emoji: '🧶',
      services: [{ label: 'Found things', screen: 'shopItems' }],
    },
    {
      npcId: 'bram',
      name: 'Watch Captain Bram',
      role: 'Watch Captain',
      emoji: '🛡️',
      services: [
        {
          label: 'The watch ledger',
          screen: 'questBoard',
          badge: questsNew || questsClaimable,
          badgeTitle: questsClaimable ? 'Rewards to claim' : 'New requests posted',
        },
      ],
    },
    {
      npcId: 'dovey',
      name: 'Innkeeper Dovey',
      role: 'Innkeeper',
      emoji: '🍺',
      services: [{ label: 'The Held Breath', screen: 'tavern', badge: tavernNew, badgeTitle: 'People have new things to say' }],
    },
    {
      npcId: 'chronicler',
      name: 'The Chronicler',
      role: 'Keeper of the record',
      emoji: '✒️',
      services: [{ label: 'The Chronicle', screen: 'chronicle' }],
    },
  ];

  return (
    <div className="panel town-panel" ref={root}>
      <div className="stage-backdrop">
        <img
          className={`painted-scene${sceneReady ? ' scene-ready' : ''}`}
          src={PAINTED_TOWN}
          alt=""
          decoding="async"
          onLoad={() => setSceneReady(true)}
          ref={(el) => {
            // cached image: onLoad may never fire, but complete is already true
            if (el && el.complete && el.naturalWidth > 0) setSceneReady(true);
          }}
        />
      </div>
      {/* NO LIGHT LAYER HERE. There used to be one, with a visible lamp
          guttering over the top of the square.

          Paul, twice now: "the town is a menu. Why are you not doing lighting
          on the map?" — and then, on seeing it shipped anyway: "why is there a
          moving floating lamp at the top of the main menu screen?"

          He is right and the reason is worth writing down so this does not get
          re-added a third time. The lighting engine earns its cost by making a
          SPACE readable — the map's pool is the move range, the battlefield's
          candles are the vigor you have left. The town is a list of people you
          click. Dimming a menu does not make it atmospheric, it makes it hard
          to read, and a lamp bobbing over a list of buttons is decoration that
          moves. Visual effort belongs on the gameplay screens. */}
      <div className="town-content">
        <h1 className="title">🌳 Everdusk</h1>
        <p className="subtitle">
          The Last Lantern burns low over the square. {4 - state.orbs.length > 0 ? `${4 - state.orbs.length} orb(s) still missing.` : 'The Abyss awaits.'}
        </p>

        <div className="town-cast">
          {cast.map((c) => {
            const painted = PAINTED_NPCS[c.npcId];
            return (
              // The card is a clickable box that CONTAINS real <button>s, which
              // is a nested-interactive violation the pad cannot survive: the
              // geometry rejects an enclosing rect as a direction, so a cursor
              // that landed on the card could never step onto the services
              // inside it. It is now out of the focus ring entirely
              // (tabIndex -1) — nothing is lost, because activating the card
              // fires exactly what its first service button fires. Mouse
              // behaviour is untouched.
              //
              // The `e.target` guard fixes a latent bug the audit found: Enter
              // on a nested service button used to bubble here and dispatch a
              // second GOTO.
              <div
                className="town-cast-card"
                key={c.npcId}
                role="button"
                tabIndex={-1}
                onClick={() => dispatch({ type: 'GOTO', screen: c.services[0].screen })}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'GOTO', screen: c.services[0].screen });
                }}
              >
                {painted ? (
                  <img src={painted} alt="" className="painted-portrait town-cast-portrait" draggable={false} />
                ) : (
                  /* v18.14: no painting yet — the SVG portrait wears the same
                     round painted-style frame instead of a flat emoji tile */
                  <div className="town-cast-portrait portrait-fallback" aria-hidden="true">
                    <NpcPortrait npcId={c.npcId} size={74} />
                  </div>
                )}
                <div className="town-cast-body">
                  <div className="town-cast-name">{c.name}</div>
                  <div className="town-cast-role">{c.role}</div>
                  <p className="town-cast-bark">“{pickBark(c.npcId, state)}”</p>
                  <div className="town-cast-services">
                    {c.services.map((s) => (
                      <button
                        key={s.screen}
                        className="btn small"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'GOTO', screen: s.screen });
                        }}
                      >
                        {s.label}
                        {s.badge && <span className="badge-dot" title={s.badgeTitle} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="town-dock">
          {/* Where the cursor starts on a first visit: the primary action. */}
          <button
            className="btn primary town-dock-gates"
            data-nav-initial=""
            data-nav-key="town-gates"
            onClick={() => dispatch({ type: 'GOTO', screen: 'gateSelect' })}
          >
            <Icon name="gates" emoji="🚪" size={34} />
            <span className="town-dock-gates-label">The Gates</span>
            <span className="town-dock-gates-sub">Venture into the dusk</span>
          </button>
          <div className="town-dock-group">
            <span className="town-dock-caption">Respite</span>
            <div className="town-dock-btns">
              <button
                className="btn town-dock-btn"
                onClick={() => dispatch({ type: 'REST' })}
                disabled={!!state.player && state.player.gold < restCost(state.player)}
              >
                <Icon name="rest" emoji="🛏️" size={26} />
                <span>Rest ({state.player ? restCost(state.player) : 0}g)</span>
              </button>
              {state.blessingChapter < state.storyChapter && (
                <button
                  className="btn town-dock-btn"
                  onClick={() => dispatch({ type: 'BLESSING' })}
                  title="Brother Casque mends the party. Free, once per chapter."
                >
                  <Icon name="rest" emoji="🕯️" size={26} />
                  <span>Casque's Blessing (free)</span>
                </button>
              )}
            </div>
          </div>
          <div className="town-dock-group">
            <span className="town-dock-caption">Contests</span>
            <div className="town-dock-btns">
              <button
                className="btn town-dock-btn"
                onClick={() => dispatch({ type: 'GOTO', screen: 'multiplayer' })}
                title="Duel another tamer. Nothing is wagered but pride."
              >
                <Icon name="duel" emoji="⚔️" size={26} />
                <span>
                  The Duelling Ring
                  {state.duelRecord ? ` (${state.duelRecord.wins}–${state.duelRecord.losses})` : ''}
                </span>
              </button>
            </div>
          </div>
          <div className="town-dock-group">
            <span className="town-dock-caption">Your Effects</span>
            <div className="town-dock-btns">
              <button className="btn town-dock-btn" onClick={() => dispatch({ type: 'GOTO', screen: 'characterSheet' })}>
                <Icon name="character" emoji="🧝" size={26} />
                <span>Character{state.player && state.player.attributePoints > 0 ? ` (${state.player.attributePoints})` : ''}</span>
              </button>
              <button className="btn town-dock-btn" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
                <Icon name="equipment" emoji="🎒" size={26} />
                <span>Equipment{state.player && state.player.items.length > 0 ? ` (${state.player.items.length})` : ''}</span>
              </button>
              <button className="btn town-dock-btn" onClick={() => dispatch({ type: 'GOTO', screen: 'deck' })}>
                <Icon name="deck" emoji="🃏" size={26} />
                <span>Deck</span>
              </button>
              <button className="btn town-dock-btn" onClick={() => dispatch({ type: 'GOTO', screen: 'saveLoad' })}>
                <Icon name="save" emoji="💾" size={26} />
                <span>Save / Load</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
