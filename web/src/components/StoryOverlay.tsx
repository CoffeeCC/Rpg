import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { STORY } from '../engine/data/story';
import { frontispieceFor } from '../engine/data/retellingLore';
import { ordinal } from '../engine/data/tellingsLore';
import { bindingById, depthByLevel } from '../engine/data/bindings';
import { loadTellings } from '../platform/tellings';
import { ChroniclerPassage } from './BookPanel';
import { isMuted } from '../platform/sfx';

/** Chapters with recorded narration (served from /public/audio). */
const NARRATION: Record<number, string> = {
  0: 'audio/narration_intro.mp3',
};

export function StoryOverlay({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const chapter = STORY.find((c) => c.id === state.pendingStory);
  const chapterId = chapter?.id;
  const windowRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [crawl, setCrawl] = useState<{ from: number; to: number; duration: number } | null>(null);

  // The Retelling pass: chapter 0 opens on a frontispiece rather than straight
  // into the crawl. On the first telling it plants the book (three sentences,
  // no mention of death — the first Fallen screen is where that lands). On
  // every telling after it restates the frame and says the thing nothing else
  // in the game says out loud: the realm's deep history is regenerated, so the
  // Chronicle genuinely will not read the same way twice.
  //
  // Keyed by chapter id rather than reset in an effect, so no extra render and
  // no chance of the crawl starting for a chapter the player has not opened.
  const [openedFor, setOpenedFor] = useState<number | null>(null);
  const meta = loadTellings();
  const wantsFrontispiece = chapterId === 0;
  const opened = !wantsFrontispiece || openedFor === chapterId;

  useEffect(() => {
    // Nothing starts — not the crawl, not the narration — until the book is open.
    if (chapterId === undefined || !opened) return;
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
  }, [chapterId, opened]);

  if (!chapter) return null;

  if (wantsFrontispiece && !opened) {
    const heroName = state.player?.name ?? 'the newcomer';
    const binding = bindingById(state.binding);
    const depth = depthByLevel(state.depth);
    return (
      <div className="overlay">
        <div className="panel story-crawl-panel frontispiece">
          <h1 className="title">📖 The Chronicler's Book</h1>
          <ChroniclerPassage paragraphs={frontispieceFor(meta.telling, { telling: ordinal(meta.telling), name: heroName })} />
          {/* Where a Binding first visibly takes hold: inscribed at the desk in
              a previous telling, and read out at the top of the one it binds. */}
          {(binding || depth.depth > 0) && (
            <p className="frontispiece-premise">
              Inscribed on this draft: <b>{binding ? binding.name : 'An Unbound Telling'}</b>
              {depth.depth > 0 ? (
                <>
                  , read at <b>{depth.name}</b>
                </>
              ) : null}
              . {binding ? binding.terms : 'The story plain, as it was first set down.'}
              {depth.depth > 0 ? ` ${depth.terms}` : ''}
            </p>
          )}
          <button className="btn primary" onClick={() => setOpenedFor(chapterId ?? 0)}>
            {meta.telling <= 1 ? 'Open the book' : `Turn to the ${ordinal(meta.telling)} telling`}
          </button>
        </div>
      </div>
    );
  }

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
