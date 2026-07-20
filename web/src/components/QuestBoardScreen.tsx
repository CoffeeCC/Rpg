import type { GameAction, GameState } from '../engine/game';
import { availableQuests } from '../engine/game';
import { QUESTS } from '../engine/data/quests';
import type { QuestDef } from '../engine/types';

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
    <div className="panel">
      <h1 className="title">📜 Quest Board</h1>
      <p className="subtitle">The folk of Everdusk could use a hand. Finish work, and more will be pinned here.</p>
      <div className="option-list">
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
            <div className="item-row" key={quest.id}>
              <div className="item-desc">
                <b>{quest.name}</b> <span className="pill">{quest.giver}</span>
                {entry && !entry.complete && (
                  <span className="pill">
                    {entry.progress}/{neededCount(quest)}
                  </span>
                )}
                {entry?.complete && !entry.claimed && <span className="pill">✅ done</span>}
                {entry?.claimed && <span className="pill">💰 claimed</span>}
                <div className="affix-line">{quest.text}</div>
                <div className="affix-line">
                  <b>{objectiveText(quest)}</b> · Reward: {reward}
                </div>
              </div>
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
          );
        })}
      </div>
      {lockedCount > 0 && (
        <p className="subtitle" style={{ marginTop: 10 }}>
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
