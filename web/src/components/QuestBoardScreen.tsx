import { useEffect, useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import { availableQuests } from '../engine/game';
import { QUESTS } from '../engine/data/quests';
import type { QuestDef } from '../engine/types';
import { Icon } from './Icon';
import { DRILL_AFTERWORD, DRILL_OFFER, DRILL_REWARD } from '../engine/data/drill';
import { noteDrillPassed, noteDrillStarted } from '../platform/drillRecord';
import { useNavScope } from '../nav';
import '../sheets.css';
import '../drill.css';

// v17 (PLAN7 C6): quests as pinned parchment notices — a board of tilted
// paper slips with a wax-brown ink palette, gold-icon reward lines, and a
// prominent Claim button. Presentation only; ACCEPT_QUEST / CLAIM_QUEST /
// GOTO dispatches unchanged.

function objectiveText(quest: QuestDef): string {
  const o = quest.objective;
  switch (o.kind) {
    case 'kill':
      return `Defeat ${o.count} monsters`;
    case 'killFamily':
      return `Defeat ${o.count} ${o.family} monsters`;
    case 'tame':
      return `Tame ${o.count} monster${o.count > 1 ? 's' : ''}`;
    case 'breed':
      return `Breed ${o.count} monster${o.count > 1 ? 's' : ''}`;
    case 'reachFloor':
      return `Reach floor ${o.floor} of the ${o.gate} gate`;
    case 'defeatBoss':
      return `Defeat the Warden of the ${o.gate} gate`;
  }
}

function neededCount(quest: QuestDef): number {
  return 'count' in quest.objective ? quest.objective.count : 1;
}

/**
 * Bram's own entry, pinned above everyone else's.
 *
 * It is deliberately NOT a `QuestDef`. The board's quests are requests from
 * the folk of Everdusk, tracked in `questLog`, with objectives drawn from a
 * closed set (`kill`, `tame`, `breed`, `reachFloor`, `defeatBoss`) — none of
 * which describes "learn to fight", and `QuestObjective` lives in a file this
 * change does not own. More importantly the drill is not a request: it is the
 * watch's own standing order, it is repeatable forever, and it must be
 * skippable, none of which the quest log models. So it is its own notice,
 * pinned first, and the ledger reads correctly for it.
 */
function StandingOrder({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const done = !!state.drillDone;
  // A veteran of an earlier telling gets the note, not the lit edge. The
  // lesson stays available to them — it is simply no longer shouting.
  const unsigned = !done && !state.drillKnown;
  const drill = state.drill;

  // The one place the watch-house sheet is written. Component-side by design:
  // the reducer is pure and never touches localStorage, and this is the only
  // moment that can tell "the lesson landed" from "the reducer ran again".
  useEffect(() => {
    if (drill?.outcome === 'passed') noteDrillPassed();
  }, [drill?.outcome]);

  return (
    <div className={`ledger-standing ${unsigned ? 'unsigned' : ''}`}>
      <div className="ledger-standing-head">
        <span className="ledger-standing-title">{DRILL_OFFER.heading}</span>
        <span className={`ledger-standing-stamp ${done ? 'done' : ''}`}>{done ? 'logged' : 'unsigned'}</span>
      </div>
      <div className="ledger-standing-giver">— {DRILL_OFFER.giver}</div>

      {/* The result of the last drill, if one just finished. Bram records the
          outcome; he does not celebrate it, and he does not scold. */}
      {drill?.outcome === 'passed' && (
        <p className="ledger-standing-text">
          <b>Drill concluded.</b> {DRILL_AFTERWORD.covenant} {DRILL_AFTERWORD.marginalia}
        </p>
      )}
      {drill?.outcome === 'halted' && (
        <p className="ledger-standing-text">
          <b>Drill halted.</b> You were restored and nothing was entered. Run it again, or do not. The article is patient
          and I am paid either way.
        </p>
      )}
      {drill?.outcome === 'left' && (
        <p className="ledger-standing-text">
          <b>Drill abandoned.</b> Entered without comment.
        </p>
      )}

      <p className="ledger-standing-text">{done ? DRILL_OFFER.recorded : DRILL_OFFER.text}</p>
      {!done && <p className="ledger-standing-ask">{DRILL_OFFER.ask}</p>}

      <div className="ledger-standing-teaches">
        <span>vigor</span>
        <span>targeting</span>
        <span>ending a turn</span>
        <span>reading intents</span>
        <span>block</span>
        <span>weakness</span>
        <span>the loss condition</span>
      </div>

      <p className="ledger-standing-reward">
        <Icon name="gold" emoji="☉" size={15} /> {done ? 'Paid: ' : 'Pays once: '}
        {DRILL_REWARD.gold}g, {DRILL_REWARD.consumable.count}× {DRILL_REWARD.consumable.name}
      </p>

      <div className="ledger-standing-actions">
        {/* A real <button>, so the pad reaches it with no work — see CONTROLLER.md.
            Repeatable forever: a confused player must always be able to redo it,
            and the payment guard in `endDrill` means repeating costs the game
            nothing. */}
        <button
          className={`btn ${unsigned ? 'primary' : 'small'}`}
          onClick={() => {
            noteDrillStarted();
            dispatch({ type: 'START_DRILL' });
          }}
        >
          {done ? 'Run the drill again' : 'Report to the yard'}
        </button>
        {!done && (
          <span className="subtitle" style={{ fontSize: 12 }}>
            Optional. The gates do not wait on it.
          </span>
        )}
      </div>
    </div>
  );
}

export function QuestBoardScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'questBoard',
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  const unlocked = availableQuests(state);
  const accepted = QUESTS.filter((q) => state.questLog.some((e) => e.id === q.id) && !unlocked.some((u) => u.id === q.id));
  const posted = [...unlocked, ...accepted];
  const lockedCount = QUESTS.length - posted.length;
  return (
    <div className="panel questboard" ref={root}>
      <h1 className="title title-with-icon"><Icon name="quests" size={26} emoji="" /> The Watch Ledger</h1>
      <NpcHost npcId="bram" state={state} />
      <p className="subtitle">The folk of Everdusk could use a hand. Finish work, and more will be pinned here.</p>
      {state.player && <StandingOrder state={state} dispatch={dispatch} />}
      <div className="quest-grid">
        {posted.map((quest) => {
          const entry = state.questLog.find((q) => q.id === quest.id);
          const reward = [
            `${quest.reward.gold}g`,
            quest.reward.exp > 0 ? `${quest.reward.exp} exp` : '',
            quest.reward.item ? 'gear' : '',
            ...(quest.reward.consumables ?? []).map((c) => `${c.count}× ${c.name}`),
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <div className={`quest-note ${entry?.claimed ? 'claimed' : ''}`} key={quest.id}>
              <span className="quest-pin" aria-hidden="true" />
              <div className="quest-name">{quest.name}</div>
              <div className="quest-giver">— {quest.giver}</div>
              {entry && (
                <div className="quest-chips">
                  {!entry.complete && (
                    <span className="quest-status">
                      {entry.progress}/{neededCount(quest)}
                    </span>
                  )}
                  {entry.complete && !entry.claimed && <span className="quest-status done">✅ done</span>}
                  {entry.claimed && <span className="quest-status">💰 claimed</span>}
                </div>
              )}
              <p className="quest-text">{quest.text}</p>
              <div className="quest-objective">
                <b>{objectiveText(quest)}</b>
              </div>
              <div className="quest-reward">
                <Icon name="gold" emoji="☉" size={17} /> Reward: {reward}
              </div>
              {(!entry || (entry.complete && !entry.claimed)) && (
                <div className="quest-actions">
                  {!entry && (
                    <button className="btn small" onClick={() => dispatch({ type: 'ACCEPT_QUEST', questId: quest.id })}>
                      Accept
                    </button>
                  )}
                  {entry?.complete && !entry.claimed && (
                    <button className="btn small primary" onClick={() => dispatch({ type: 'CLAIM_QUEST', questId: quest.id })}>
                      Claim
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lockedCount > 0 && (
        <p className="subtitle quest-locked" style={{ marginTop: 10 }}>
          {lockedCount} more request{lockedCount === 1 ? '' : 's'} wait for a name people trust.
        </p>
      )}
      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
    </div>
  );
}
