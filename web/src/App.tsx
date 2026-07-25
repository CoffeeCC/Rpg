import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import './App.css';
import './battle.css';
import './v5.css';
import './v16.css';
import './transition.css';
import { gameReducer, initialGameState, type Screen } from './engine/game';
import { CreateScreen } from './components/CreateScreen';
import { TownScreen } from './components/TownScreen';
import { GateSelectScreen } from './components/GateSelectScreen';
import { FloorScreen } from './components/FloorScreen';
import { BattleScreen } from './components/BattleScreen';
import { CardRewardScreen } from './components/CardRewardScreen';
import { EventScreen } from './components/EventScreen';
import { ShopItemsScreen, ShopGearScreen } from './components/ShopScreens';
import { StableScreen } from './components/StableScreen';
import { BreedingScreen } from './components/BreedingScreen';
import { QuestBoardScreen } from './components/QuestBoardScreen';
import { TavernScreen } from './components/TavernScreen';
import { ChronicleScreen } from './components/ChronicleScreen';
import { CharacterSheetScreen } from './components/CharacterSheetScreen';
import { DeckScreen } from './components/DeckScreen';
import { CardCodexScreen } from './components/CardCodexScreen';
import { SmithScreen } from './components/SmithScreen';
import { LegendOverlay } from './components/LegendOverlay';
import { SaveLoadScreen } from './components/SaveLoadScreen';
import { VictoryScreen } from './components/VictoryScreen';
import { StoryOverlay } from './components/StoryOverlay';
import { FallenScreen } from './components/FallenScreen';
import { MonsterSheetScreen } from './components/MonsterSheetScreen';
import { MultiplayerScreen } from './components/MultiplayerScreen';
import { PartySidebar } from './components/PartySidebar';
import { LogPanel } from './components/LogPanel';
import { Icon } from './components/Icon';
import { HeroImage } from './art/MonsterImage';
import { PAINTED_BACKDROPS, PAINTED_TOWN } from './art/painted';
import { play as sfx, setMuted, isMuted } from './platform/sfx';
import { setMusicContext, setMusicMuted, isMusicMuted } from './platform/music';

type Banner = { text: string; kind: 'victory' | 'death' | 'tamed' } | null;

/** v19 encounter transition — durations must match the contract in transition.css. */
const TX_COVER_MS = 460;
const TX_REVEAL_MS = 560;
const TX_RETURN_MS = 720;
/** Obsidian blades that stab the screen shut. Index feeds the CSS stagger. */
const TX_BLADES = Array.from({ length: 14 }, (_, i) => i);

type Transition = { kind: 'encounter' | 'return'; phase: 'cover' | 'reveal' } | null;

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialGameState);
  const [banner, setBanner] = useState<Banner>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [musicOff, setMusicOff] = useState(isMusicMuted());
  const prevScreen = useRef<Screen>(state.screen);

  // v19: the transition holds the outgoing screen on stage while the seal
  // closes over it, so the player never sees a raw screen swap.
  const [tx, setTx] = useState<Transition>(null);
  const [heldScreen, setHeldScreen] = useState<Screen | null>(null);
  const txPrev = useRef<Screen>(state.screen);
  const txTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // v19: three musical contexts, crossfaded by platform/music.ts. Battle music
  // is asked for the instant the encounter fires — i.e. underneath the
  // transition — so the sting lands before the battlefield does.
  useEffect(() => {
    setMusicContext(
      state.screen === 'battle' ? 'battle' : state.screen === 'floor' ? 'expedition' : 'town',
    );
  }, [state.screen]);

  useEffect(() => {
    const prev = txPrev.current;
    txPrev.current = state.screen;
    if (prev === state.screen) return;

    const timers = txTimers.current;
    const reduced = prefersReducedMotion();
    // A screen change with no transition of its own must not leave an older
    // overlay stranded on screen.
    setTx(null);
    setHeldScreen(null);

    if (state.screen === 'battle') {
      const cover = reduced ? 180 : TX_COVER_MS;
      const reveal = reduced ? 220 : TX_REVEAL_MS;
      // Only the map is safe to keep mounted behind the closing seal: the
      // reducer ignores MOVE/END_MAP_TURN once screen !== 'floor', and the
      // expedition state it renders from is untouched by the fight starting.
      // Other origin screens may already have had their backing state cleared.
      if (prev === 'floor') setHeldScreen(prev);
      setTx({ kind: 'encounter', phase: 'cover' });
      timers.push(
        setTimeout(() => {
          setHeldScreen(null);
          setTx({ kind: 'encounter', phase: 'reveal' });
        }, cover),
      );
      timers.push(setTimeout(() => setTx(null), cover + reveal));
    } else if (prev === 'battle') {
      setTx({ kind: 'return', phase: 'reveal' });
      timers.push(setTimeout(() => setTx(null), reduced ? 260 : TX_RETURN_MS));
    }

    return () => {
      for (const t of timers) clearTimeout(t);
      txTimers.current = [];
    };
  }, [state.screen]);

  // Skippable: any input past the first beat drops the rest of the effect.
  useEffect(() => {
    if (!tx) return;
    const openedAt = Date.now();
    const skip = () => {
      // Ignore the very input that triggered the encounter (key repeat, the
      // click that bumped the monster) — only a deliberate second one skips.
      if (Date.now() - openedAt < 220) return;
      for (const t of txTimers.current) clearTimeout(t);
      txTimers.current = [];
      setHeldScreen(null);
      setTx(null);
    };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [tx]);

  // Souls-style full-stage banners on battle transitions.
  useEffect(() => {
    const prev = prevScreen.current;
    prevScreen.current = state.screen;
    if (prev !== 'battle' || state.screen === 'battle') return;
    if (state.screen === 'town') {
      sfx('defeat');
      setBanner({ text: 'THE LIGHT FADES', kind: 'death' });
      setTimeout(() => setBanner(null), 2400);
    } else if (state.screen === 'cardReward') {
      sfx('victory');
      setBanner({ text: 'ENEMIES FELLED', kind: 'victory' });
      setTimeout(() => setBanner(null), 1600);
    } else if (state.screen === 'floor') {
      const tamedLine = state.log[state.log.length - 1]?.includes('walks beside you');
      if (tamedLine) {
        setBanner({ text: 'A BOND IS FORGED', kind: 'tamed' });
        setTimeout(() => setBanner(null), 1600);
      } else {
        sfx('victory');
        setBanner({ text: 'ENEMIES FELLED', kind: 'victory' });
        setTimeout(() => setBanner(null), 1600);
      }
    }
  }, [state.screen, state.log]);

  const player = state.player;
  const backScreen: Screen = state.expedition ? 'floor' : 'town';
  /** What the player is looking at — the real screen, or the one being held
   *  on stage for the length of the transition's cover phase. */
  const view: Screen = heldScreen ?? state.screen;
  const inBattle = view === 'battle';

  // v15: level-ups get a full-stage moment (delayed so it follows the victory
  // banner instead of fighting it), plus a pointer at the unspent points.
  const prevLevel = useRef<number | null>(null);
  useEffect(() => {
    const level = state.player?.level ?? null;
    const prev = prevLevel.current;
    prevLevel.current = level;
    if (level === null || prev === null || level <= prev) return;
    const t = setTimeout(() => {
      sfx('victory');
      setBanner({ text: `LEVEL ${level}`, kind: 'victory' });
      setTimeout(() => setBanner(null), 2200);
    }, 1700);
    return () => clearTimeout(t);
  }, [state.player?.level]);

  if (!player || state.screen === 'create') {
    return (
      <div className="game no-shell">
        <CreateScreen dispatch={dispatch} />
      </div>
    );
  }

  // v16: the world stays visible behind every interface screen — the current
  // gate's painting mid-expedition, the town square otherwise. Town and battle
  // draw their own crisp backdrops.
  const sceneSrc =
    inBattle || view === 'town'
      ? null
      : (state.expedition && PAINTED_BACKDROPS[state.expedition.gateId]) || PAINTED_TOWN;

  // v16: screens you can always step back out of via the HUD chip. Floor,
  // battle, events, and rewards manage their own exits.
  const backable: Screen[] = [
    'stable', 'breeding', 'questBoard', 'tavern', 'chronicle', 'deck', 'smith',
    'characterSheet', 'equipment', 'saveLoad', 'monsterSheet', 'shopItems', 'shopGear', 'gateSelect',
  ];
  const showBack = backable.includes(view);

  return (
    <div className={`game ${inBattle ? 'battle-mode' : ''}`}>
      {sceneSrc && (
        <div className="scene-layer" aria-hidden="true">
          <img src={sceneSrc} alt="" draggable={false} />
        </div>
      )}
      <header className="game-header hud">
        {showBack && (
          <button
            className="btn small hud-back"
            title={state.expedition ? 'Back to the expedition' : 'Back to town'}
            onClick={() => {
              sfx('uiClick');
              dispatch({ type: 'GOTO', screen: backScreen });
            }}
          >
            ↩ {state.expedition ? 'Expedition' : 'Town'}
          </button>
        )}
        <div className="hud-hero">
          <div className="hud-crest">
            <HeroImage className={player.className} size={46} />
          </div>
          <div className="hud-idblock">
            <div className="hud-name">{player.name}</div>
            <div className="hud-sub">
              Lv {player.level} · {player.race} {player.className}
            </div>
            <div className="hud-exp" title={`EXP ${player.exp}/${player.expToNext()}`}>
              <div className="hud-exp-fill" style={{ width: `${Math.min(100, Math.round((player.exp / player.expToNext()) * 100))}%` }} />
            </div>
          </div>
        </div>

        {state.world && <span className="realm-name hud-realm">{state.world.name}</span>}

        <div className="hud-right">
          <div className="hud-vitals">
            <div className="hud-vital">
              <div className="hud-vbar">
                <div className="hud-vfill hp" style={{ width: `${Math.max(0, Math.round((player.hp / player.maxHp) * 100))}%` }} />
              </div>
              <span className="hud-vlabel">
                {player.hp}/{player.maxHp}
              </span>
            </div>
            <div className="hud-vital">
              <div className="hud-vbar">
                <div className="hud-vfill mp" style={{ width: `${player.maxMp ? Math.max(0, Math.round((player.mp / player.maxMp) * 100)) : 0}%` }} />
              </div>
              <span className="hud-vlabel">
                {player.mp}/{player.maxMp}
              </span>
            </div>
          </div>

          <div className="hud-gold" title="Gold">
            <Icon name="gold" emoji="☉" size={18} /> {player.gold}
          </div>

          <span className="orbs hud-orbs" title={`Wardens' Orbs: ${state.orbs.length}/4`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`orb ${i < state.orbs.length ? 'filled' : 'empty'}`} />
            ))}
          </span>

          <button
            className="btn small hud-mute"
            title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-pressed={muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>

          {/* v19: music mutes independently of the SFX chip beside it. */}
          <button
            className={`btn small hud-music ${musicOff ? 'off' : ''}`}
            title={musicOff ? 'Music off' : 'Music on'}
            aria-pressed={!musicOff}
            aria-label={musicOff ? 'Turn music on' : 'Turn music off'}
            onClick={() => {
              const next = !musicOff;
              setMusicMuted(next);
              setMusicOff(next);
              sfx('uiClick');
            }}
          >
            ♪
          </button>
        </div>
      </header>

      <main className={`game-main${tx?.kind === 'encounter' && tx.phase === 'cover' ? ' tx-seize' : ''}`}>
        {view === 'town' && <TownScreen state={state} dispatch={dispatch} />}
        {view === 'gateSelect' && <GateSelectScreen state={state} dispatch={dispatch} />}
        {view === 'floor' && <FloorScreen state={state} dispatch={dispatch} />}
        {view === 'battle' && <BattleScreen state={state} dispatch={dispatch} />}
        {view === 'cardReward' && <CardRewardScreen state={state} dispatch={dispatch} />}
        {view === 'event' && <EventScreen state={state} dispatch={dispatch} />}
        {view === 'shopItems' && <ShopItemsScreen state={state} dispatch={dispatch} />}
        {view === 'shopGear' && <ShopGearScreen state={state} dispatch={dispatch} />}
        {view === 'stable' && <StableScreen state={state} dispatch={dispatch} />}
        {view === 'breeding' && <BreedingScreen state={state} dispatch={dispatch} />}
        {view === 'questBoard' && <QuestBoardScreen state={state} dispatch={dispatch} />}
        {view === 'tavern' && <TavernScreen state={state} dispatch={dispatch} />}
        {view === 'chronicle' && <ChronicleScreen state={state} dispatch={dispatch} />}
        {view === 'deck' && <DeckScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {view === 'cardCodex' && <CardCodexScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {view === 'smith' && <SmithScreen state={state} dispatch={dispatch} />}
        {view === 'characterSheet' && <CharacterSheetScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {view === 'monsterSheet' && <MonsterSheetScreen state={state} dispatch={dispatch} />}
        {view === 'equipment' && <CharacterSheetScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {view === 'saveLoad' && <SaveLoadScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {view === 'victory' && <VictoryScreen state={state} dispatch={dispatch} />}
        {view === 'fallen' && <FallenScreen state={state} dispatch={dispatch} />}
        {view === 'multiplayer' && <MultiplayerScreen state={state} dispatch={dispatch} />}
      </main>

      {!inBattle ? (
        <aside className="game-sidebar">
          <PartySidebar hero={player} party={state.party} />
          <div className="game-log side-log">
            <LogPanel lines={state.log} allyNames={[player.name, ...state.party.map((m) => m.nickname)]} />
          </div>
        </aside>
      ) : (
        <div className="game-log">
          <LogPanel lines={state.log} allyNames={[player.name, ...state.party.map((m) => m.nickname)]} />
        </div>
      )}

      {state.pendingStory !== null && <StoryOverlay state={state} dispatch={dispatch} />}

      {state.pendingLegend !== null && <LegendOverlay state={state} dispatch={dispatch} />}

      {/* v19 encounter transition. Cover phase: the world is still mounted
          underneath and seizes/pushes in while the flash, swirl and blades
          close over it. Reveal phase: the battle is mounted behind the
          blackout and the blades peel away off it. Styles: transition.css. */}
      {tx && (
        <div className={`tx-layer tx-${tx.kind} tx-${tx.phase}`} aria-hidden="true">
          <div className="tx-flash" />
          <div className="tx-swirl" />
          <div className="tx-blades">
            {TX_BLADES.map((i) => (
              <span key={i} className="tx-blade" style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
          <div className="tx-veil" />
          <div className="tx-embers" />
        </div>
      )}

      {banner && (
        <div className={`stage-banner banner-${banner.kind}`}>
          <span>{banner.text}</span>
        </div>
      )}
    </div>
  );
}

export default App;
