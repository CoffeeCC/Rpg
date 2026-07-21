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
  const windowRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [crawl, setCrawl] = useState<{ from: number; to: number; duration: number } | null>(null);

  useEffect(() => {
    if (chapterId === undefined) return;
    const chapterNow = STORY.find((c) => c.id === chapterId);
    const totalChars = (chapterNow?.paragraphs ?? []).join(' ').length || 1;
    // Reading-pace fallback (~17 chars/sec) when there is no audible narration.
    const fallbackDuration = Math.max(24, totalChars / 17);

    const measure = () => ({
      from: windowRef.current?.clientHeight ?? 480,
      to: -(contentRef.current?.scrollHeight ?? 1200),
    });

    const src = NARRATION[chapterId];
    if (!src || isMuted()) {
      setCrawl({ ...measure(), duration: fallbackDuration });
      return;
    }

    const audio = new Audio(src);
    audio.volume = 0.9;
    let cancelled = false;

    const begin = (duration: number) => {
      if (!cancelled) setCrawl({ ...measure(), duration });
    };

    audio.addEventListener('error', () => begin(fallbackDuration));
    audio
      .play()
      .then(() => {
        if (audio.duration && isFinite(audio.duration)) begin(audio.duration);
        else
          audio.addEventListener('loadedmetadata', () => begin(isFinite(audio.duration) ? audio.duration : fallbackDuration), {
            once: true,
          });
      })
      .catch(() => begin(fallbackDuration));

    return () => {
      cancelled = true;
      audio.pause();
      audio.src = '';
    };
  }, [chapterId]);

  if (!chapter) return null;

  return (
    <div className="overlay">
      <div className="panel story-crawl-panel">
        <h1 className="title">📖 {chapter.title}</h1>
        <div className="story-crawl-window" ref={windowRef}>
          <div
            className="story-crawl-content"
            ref={contentRef}
            style={
              crawl
                ? ({
                    ['--crawl-from' as string]: `${crawl.from}px`,
                    ['--crawl-to' as string]: `${crawl.to}px`,
                    animation: `story-crawl ${crawl.duration}s linear forwards`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {chapter.paragraphs.map((p, i) => (
              <p className="story-paragraph" key={i}>
                {p}
              </p>
            ))}
          </div>
        </div>
        <button className="btn primary" onClick={() => dispatch({ type: 'STORY_CONTINUE' })}>
          Continue
        </button>
      </div>
    </div>
  );
}
