import type { GameAction, GameState } from '../engine/game';
import { NpcHost } from './NpcHost';
import { availableQuests } from '../engine/game';
import { QUESTS } from '../engine/data/quests';
import type { QuestDef } from '../engine/types';
import { Icon } from './Icon';
import '../sheets.css';

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

export function QuestBoardScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const unlocked = availableQuests(state);
  const accepted = QUESTS.filter((q) => state.questLog.some((e) => e.id === q.id) && !unlocked.some((u) => u.id === q.id));
  const posted = [...unlocked, ...accepted];
  const lockedCount = QUESTS.length - posted.length;
  return (
    <div className="panel questboard">
      <h1 className="title title-with-icon"><Icon name="quests" size={26} emoji="" /> The Watch Ledger</h1>
      <NpcHost npcId="bram" state={state} />
      <p className="subtitle">The folk of Everdusk could use a hand. Finish work, and more will be pinned here.</p>
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
