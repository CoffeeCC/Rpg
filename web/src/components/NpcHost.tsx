import { useEffect, useMemo, useRef } from 'react';
import type { GameState } from '../engine/game';
import { NPCS } from '../engine/data/npcs';
import { SERVICE_BARKS, type BarkContext } from '../engine/data/serviceBarks';
import { EXTRA_VOICED_LINES } from '../engine/data/extraDialogue';
import { NPC_LINE_AUDIO } from '../engine/data/npcLineAudio';
import { PAINTED_NPCS } from '../art/paintedCharacters';
import { loadTellings } from '../platform/tellings';
import { isMuted } from '../platform/sfx';

const AUDIO_BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '';

// v10: services are hosted by people. Every service screen opens under the
// face of whoever runs it, with a state-aware bark — Ott mutters about YOUR
// monsters, Grude addresses the merchandise, the Chronicler annotates you.

/** Which contextual bark pools apply to the current game state, best-first. */
function activeContexts(state: GameState): BarkContext[] {
  const ctx: BarkContext[] = [];
  const party = state.party;
  if (loadTellings().telling >= 2) ctx.push('retelling');
  if (party.some((m) => m.bond >= 25)) ctx.push('bondHigh');
  if (party.some((m) => m.bond <= 2)) ctx.push('bondLow');
  if (party.length === 0 && state.stable.length === 0) ctx.push('partyEmpty');
  if (state.orbs.length > 0) ctx.push('postOrb');
  const gold = state.player?.gold ?? 0;
  if (gold >= 500) ctx.push('goldRich');
  if (gold < 30) ctx.push('goldPoor');
  return ctx;
}

/** Pick a bark for an NPC: usually flavor-of-the-moment context, sometimes
 * plain. Deterministic per visit-ish (keyed to gold+screen) so it doesn't
 * reroll on every re-render, but changes as the player does things. */
export function pickBark(npcId: string, state: GameState): string {
  const pools = SERVICE_BARKS[npcId];
  if (!pools) return '';
  const seed = (state.player?.gold ?? 0) + state.party.length * 7 + state.chronicle.deeds.length * 13 + state.screen.length;
  // v13: the nine voiced NPCs mostly speak a recorded extra line (so you HEAR
  // them); one visit in three drops back to a context-aware service bark for
  // variety. Grude/chronicler have no extra pool and always use serviceBarks.
  const voiced = EXTRA_VOICED_LINES[npcId];
  if (voiced && voiced.length > 0 && seed % 3 !== 0) {
    return voiced[seed % voiced.length];
  }
  const ctxs = activeContexts(state).filter((c) => (pools[c]?.length ?? 0) > 0);
  const useCtx = ctxs.length > 0 && seed % 2 === 0; // contextual half the fallback visits
  const pool = useCtx ? pools[ctxs[seed % ctxs.length]]! : pools.default;
  let line = pool[seed % pool.length];
  line = line.replaceAll('{name}', state.player?.name ?? 'stranger');
  const monster = state.party.length > 0 ? state.party[seed % state.party.length] : null;
  line = line.replaceAll('{monster}', monster?.nickname ?? 'that beast of yours');
  return line;
}

/** The host banner: portrait, name, role, one bark. `npcId: 'chronicler'` has
 * no portrait or NpcDef by design — the record-keeper stays faceless. */
export function NpcHost({ npcId, state }: { npcId: string; state: GameState }) {
  const npc = NPCS.find((n) => n.id === npcId);
  const bark = useMemo(() => pickBark(npcId, state), [npcId, state]);
  // v11: barks with a recorded line get spoken (the Chronicler speaks with the
  // narrator's voice — same person, it turns out). Text-only barks stay text.
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    voiceRef.current?.pause();
    if (isMuted()) return;
    const clip = NPC_LINE_AUDIO[`${npcId}|${bark}`];
    if (!clip) return;
    const audio = new Audio(AUDIO_BASE + clip);
    audio.volume = 0.95;
    voiceRef.current = audio;
    audio.play().catch(() => {});
    return () => audio.pause();
  }, [npcId, bark]);
  const painted = PAINTED_NPCS[npcId];
  const name = npc?.name ?? 'The Chronicler';
  const role = npc?.role ?? 'Keeper of the record';
  const emoji = npc?.emoji ?? '✒️';
  return (
    <div className="npc-host">
      {painted ? (
        <img src={painted} width={84} height={84} alt="" className="painted-portrait npc-host-portrait" draggable={false} />
      ) : (
        <div className="npc-host-portrait npc-host-emoji">{emoji}</div>
      )}
      <div className="npc-host-body">
        <div className="npc-host-name">
          {name} <span className="pill">{role}</span>
        </div>
        {bark && <p className="npc-host-bark">“{bark}”</p>}
      </div>
    </div>
  );
}
