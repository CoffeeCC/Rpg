import { useEffect, useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { STORY } from '../engine/data/story';
import { isMuted } from '../platform/sfx';

/** Chapters with recorded narration (served from /public/audio). */
const NARRATION: Record<number, string> = {
  0: '/audio/narration_intro.mp3',
};

export function StoryOverlay({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const chapter = STORY.find((c) => c.id === state.pendingStory);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chapterId = chapter?.id;

  useEffect(() => {
    if (chapterId === undefined) return;
    const src = NARRATION[chapterId];
    if (!src || isMuted()) return;
    const audio = new Audio(src);
    audio.volume = 0.9;
    audioRef.current = audio;
    // The player just clicked (Begin/Continue), so autoplay is permitted.
    audio.play().catch(() => {
      // Autoplay refused (no prior gesture) — the page stays silent, nothing breaks.
    });
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [chapterId]);

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
