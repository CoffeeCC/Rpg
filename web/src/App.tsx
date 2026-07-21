import { useEffect, useReducer, useRef, useState } from 'react';
import './App.css';
import './battle.css';
import './v5.css';
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
import { EquipmentScreen } from './components/EquipmentScreen';
import { DeckScreen } from './components/DeckScreen';
import { SmithScreen } from './components/SmithScreen';
import { LegendOverlay } from './components/LegendOverlay';
import { SaveLoadScreen } from './components/SaveLoadScreen';
import { VictoryScreen } from './components/VictoryScreen';
import { StoryOverlay } from './components/StoryOverlay';
import { FallenScreen } from './components/FallenScreen';
import { MonsterSheetScreen } from './components/MonsterSheetScreen';
import { PartySidebar } from './components/PartySidebar';
import { LogPanel } from './components/LogPanel';
import { play as sfx, setMuted, isMuted } from './platform/sfx';

type Banner = { text: string; kind: 'victory' | 'death' | 'tamed' } | null;

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialGameState);
  const [banner, setBanner] = useState<Banner>(null);
  const [muted, setMutedState] = useState(isMuted());
  const prevScreen = useRef<Screen>(state.screen);

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
  const inBattle = state.screen === 'battle';

  if (!player || state.screen === 'create') {
    return (
      <div className="game no-shell">
        <CreateScreen dispatch={dispatch} />
      </div>
    );
  }

  return (
    <div className={`game ${inBattle ? 'battle-mode' : ''}`}>
      <header className="game-header">
        <span className="hud-name">
          {player.name} · Lv{player.level} {player.race} {player.className}
        </span>
        {state.world && <span className="realm-name">{state.world.name}</span>}
        <span className="gold">☉ {player.gold}</span>
        <span className="orbs" title={`Wardens' Orbs: ${state.orbs.length}/4`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`orb ${i < state.orbs.length ? 'filled' : 'empty'}`} />
          ))}
        </span>
        <span className="pill">
          EXP {player.exp}/{player.expToNext()}
        </span>
        <button
          className="btn small"
          title={muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setMutedState(next);
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <main className="game-main">
        {state.screen === 'town' && <TownScreen state={state} dispatch={dispatch} />}
        {state.screen === 'gateSelect' && <GateSelectScreen state={state} dispatch={dispatch} />}
        {state.screen === 'floor' && <FloorScreen state={state} dispatch={dispatch} />}
        {state.screen === 'battle' && <BattleScreen state={state} dispatch={dispatch} />}
        {state.screen === 'cardReward' && <CardRewardScreen state={state} dispatch={dispatch} />}
        {state.screen === 'event' && <EventScreen state={state} dispatch={dispatch} />}
        {state.screen === 'shopItems' && <ShopItemsScreen state={state} dispatch={dispatch} />}
        {state.screen === 'shopGear' && <ShopGearScreen state={state} dispatch={dispatch} />}
        {state.screen === 'stable' && <StableScreen state={state} dispatch={dispatch} />}
        {state.screen === 'breeding' && <BreedingScreen state={state} dispatch={dispatch} />}
        {state.screen === 'questBoard' && <QuestBoardScreen state={state} dispatch={dispatch} />}
        {state.screen === 'tavern' && <TavernScreen state={state} dispatch={dispatch} />}
        {state.screen === 'chronicle' && <ChronicleScreen state={state} dispatch={dispatch} />}
        {state.screen === 'deck' && <DeckScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {state.screen === 'smith' && <SmithScreen state={state} dispatch={dispatch} />}
        {state.screen === 'characterSheet' && <CharacterSheetScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {state.screen === 'monsterSheet' && <MonsterSheetScreen state={state} dispatch={dispatch} />}
        {state.screen === 'equipment' && <EquipmentScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {state.screen === 'saveLoad' && <SaveLoadScreen state={state} backScreen={backScreen} dispatch={dispatch} />}
        {state.screen === 'victory' && <VictoryScreen state={state} dispatch={dispatch} />}
        {state.screen === 'fallen' && <FallenScreen state={state} dispatch={dispatch} />}
      </main>

      {!inBattle && (
        <aside className="game-sidebar">
          <PartySidebar hero={player} party={state.party} />
        </aside>
      )}

      <div className="game-log">
        <LogPanel lines={state.log} />
      </div>

      {state.pendingStory !== null && <StoryOverlay state={state} dispatch={dispatch} />}

      {state.pendingLegend !== null && <LegendOverlay state={state} dispatch={dispatch} />}

      {banner && (
        <div className={`stage-banner banner-${banner.kind}`}>
          <span>{banner.text}</span>
        </div>
      )}
    </div>
  );
}

export default App;
