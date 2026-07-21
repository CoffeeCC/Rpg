import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { STORY } from '../engine/data/story';
import { isMuted } from '../platform/sfx';

/** Chapters with recorded narration (served from /public/audio). */
const NARRATION: Record<number, string> = {
  0: '/audio/narration_intro.mp3',
};

export function StoryOverlay({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const chapter = STORY.find((c) => c.id === state.pendingStory);
  const chapterId = chapter?.id;
  const paragraphs = chapter?.paragraphs ?? [];
  const [visibleCount, setVisibleCount] = useState(Number.MAX_SAFE_INTEGER);
  const lastShownRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (chapterId === undefined) return;
    const src = NARRATION[chapterId];
    if (!src || isMuted()) {
      setVisibleCount(Number.MAX_SAFE_INTEGER);
      return;
    }

    const audio = new Audio(src);
    audio.volume = 0.9;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const revealAll = () => setVisibleCount(Number.MAX_SAFE_INTEGER);

    const startSyncedReveal = () => {
      if (cancelled) return;
      const duration = audio.duration;
      if (!isFinite(duration) || duration <= 0) {
        revealAll();
        return;
      }
      // Pace each paragraph by its share of the total text, so the reveal
      // tracks the reading. Land the last one slightly before the audio ends.
      const chapterNow = STORY.find((c) => c.id === chapterId);
      const paras = chapterNow?.paragraphs ?? [];
      const total = paras.reduce((sum, p) => sum + p.length, 0) || 1;
      const usable = duration * 0.94;
      let cum = 0;
      setVisibleCount(1);
      paras.forEach((p, i) => {
        if (i === 0) {
          cum += p.length;
          return;
        }
        const at = (cum / total) * usable * 1000;
        cum += p.length;
        timers.push(setTimeout(() => setVisibleCount(i + 1), at));
      });
    };

    // Only crawl the text if the narration is actually audible; otherwise
    // (autoplay refused, load error) show everything at once.
    setVisibleCount(0);
    audio.addEventListener('error', revealAll);
    audio
      .play()
      .then(() => {
        if (audio.duration && isFinite(audio.duration)) startSyncedReveal();
        else audio.addEventListener('loadedmetadata', startSyncedReveal, { once: true });
      })
      .catch(revealAll);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers = [];
      audio.pause();
      audio.src = '';
    };
  }, [chapterId]);

  // Follow the reveal: keep the newest paragraph in view.
  useEffect(() => {
    lastShownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [visibleCount]);

  if (!chapter) return null;
  const shown = Math.max(visibleCount, 0);

  return (
    <div className="overlay">
      <div className="panel">
        <h1 className="title">📖 {chapter.title}</h1>
        {paragraphs.map((p, i) => (
          <p
            className={`story-paragraph ${i < shown ? 'story-shown' : 'story-hidden'}`}
            key={i}
            ref={i === shown - 1 ? lastShownRef : undefined}
          >
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
