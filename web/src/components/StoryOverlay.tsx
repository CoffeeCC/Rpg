import type { GameAction, GameState } from '../engine/game';
import { STORY } from '../engine/data/story';

export function StoryOverlay({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const chapter = STORY.find((c) => c.id === state.pendingStory);
  if (!chapter) return null;
  return (
    <div className="overlay">
      <div className="panel">
        <h1 className="title">📖 {chapter.title}</h1>
        {chapter.paragraphs.map((p, i) => (
          <p className="story-paragraph" key={i}>
            {p}
          </p>
        ))}
        <button className="btn primary" onClick={() => dispatch({ type: 'STORY_CONTINUE' })}>
          Continue
        </button>
      </div>
    </div>
  );
}
