import type { GameAction, GameState, Screen } from '../engine/game';
import { availableQuests, restCost } from '../engine/game';
import { Icon } from './Icon';
import { PAINTED_TOWN } from '../art/painted';
import { PAINTED_NPCS } from '../art/paintedCharacters';
import { pickBark } from './NpcHost';

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
    <div className="panel town-panel">
      <div className="stage-backdrop">
        <img className="painted-scene" src={PAINTED_TOWN} alt="" />
      </div>
      <div className="town-content">
        <h1 className="title">🌳 Everdusk</h1>
        <p className="subtitle">
          The Last Lantern burns low over the square. {4 - state.orbs.length > 0 ? `${4 - state.orbs.length} orb(s) still missing.` : 'The Abyss awaits.'}
        </p>

        <div className="town-cast">
          {cast.map((c) => {
            const painted = PAINTED_NPCS[c.npcId];
            return (
              <div
                className="town-cast-card"
                key={c.npcId}
                role="button"
                tabIndex={0}
                onClick={() => dispatch({ type: 'GOTO', screen: c.services[0].screen })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'GOTO', screen: c.services[0].screen });
                }}
              >
                {painted ? (
                  <img src={painted} alt="" className="painted-portrait town-cast-portrait" draggable={false} />
                ) : (
                  <div className="town-cast-portrait town-cast-emoji">{c.emoji}</div>
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

        <div className="menu-grid town-quick-strip">
          <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'gateSelect' })}>
            <Icon name="gates" emoji="🚪" size={22} /> The Gates
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'REST' })} disabled={!!state.player && state.player.gold < restCost(state.player)}>
            <Icon name="rest" emoji="🛏️" size={22} /> Rest ({state.player ? restCost(state.player) : 0}g)
          </button>
          {state.blessingChapter < state.storyChapter && (
            <button className="btn" onClick={() => dispatch({ type: 'BLESSING' })} title="Brother Casque mends the party. Free, once per chapter.">
              <Icon name="rest" emoji="🕯️" size={22} /> Casque's Blessing (free)
            </button>
          )}
          <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'characterSheet' })}>
            <Icon name="character" emoji="🧝" size={22} /> Character{state.player && state.player.attributePoints > 0 ? ` (${state.player.attributePoints})` : ''}
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
            <Icon name="equipment" emoji="🎒" size={22} /> Equipment{state.player && state.player.items.length > 0 ? ` (${state.player.items.length})` : ''}
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'deck' })}>
            <Icon name="deck" emoji="🃏" size={22} /> Deck
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'saveLoad' })}>
            <Icon name="save" emoji="💾" size={22} /> Save / Load
          </button>
        </div>
      </div>
    </div>
  );
}
