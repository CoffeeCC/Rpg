// v20 (PLAN9 workstream B): integrity of the town's spoken dialogue.
//
// The audio contract is unusual and worth stating plainly: a clip is keyed by
// `${npcId}|${exact line text}`, so REWORDING A VOICED LINE SILENTLY ORPHANS A
// PAID-FOR RECORDING. These tests are the guard rail for that — they fail loudly
// when a manifest key stops matching authored data, when a clip file goes
// missing, and when a line is duplicated inside one character's repertoire.
//
// The mp3 listing comes from import.meta.glob rather than node:fs: src/ is
// type-checked with `"types": ["vite/client"]`, so node builtins are not
// available to tests. The glob is lazy — nothing is decoded, we only read keys.
import { describe, expect, it } from 'vitest';
import { NPCS, VOICE_BIBLE } from '../data/npcs';
import { EXTRA_VOICED_LINES } from '../data/extraDialogue';
import { SERVICE_BARKS } from '../data/serviceBarks';
import { NPC_LINE_AUDIO } from '../data/npcLineAudio';
import VOICE_IDS from '../../../public/audio/npc_voices.json';

/** Basenames of every clip actually present in public/audio/lines. */
const CLIPS_ON_DISK = new Set(
  Object.keys(import.meta.glob('../../../public/audio/lines/*.mp3')).map((p) => p.split('/').pop() ?? ''),
);

/** 'chronicler' has no NpcDef by design (faceless archivist, see NpcHost). */
const CHRONICLER = 'chronicler';
const NPC_IDS = new Set([...NPCS.map((n) => n.id), CHRONICLER]);

/** Every line that can be spoken verbatim (and therefore voiced). */
function voiceableLines(): { npcId: string; text: string; source: string }[] {
  const out: { npcId: string; text: string; source: string }[] = [];
  for (const npc of NPCS) {
    npc.greetings.forEach((pool, stage) => {
      for (const text of pool) out.push({ npcId: npc.id, text, source: `greeting stage ${stage}` });
    });
  }
  for (const [npcId, lines] of Object.entries(EXTRA_VOICED_LINES)) {
    for (const text of lines) out.push({ npcId, text, source: 'extra' });
  }
  return out;
}

/** Everything an NPC can say, voiced or not — used for the duplicate sweep. */
function allLinesByNpc(): Map<string, { text: string; source: string }[]> {
  const byNpc = new Map<string, { text: string; source: string }[]>();
  const push = (npcId: string, text: string, source: string) => {
    const list = byNpc.get(npcId) ?? [];
    list.push({ text, source });
    byNpc.set(npcId, list);
  };
  for (const { npcId, text, source } of voiceableLines()) push(npcId, text, source);
  for (const npc of NPCS) for (const text of npc.rumors) push(npc.id, text, 'rumor');
  for (const [npcId, pools] of Object.entries(SERVICE_BARKS)) {
    for (const [ctx, lines] of Object.entries(pools)) {
      for (const text of lines ?? []) push(npcId, text, `bark:${ctx}`);
    }
  }
  return byNpc;
}

describe('npcLineAudio manifest', () => {
  it('has clips on disk (sanity: the glob found the audio directory)', () => {
    expect(CLIPS_ON_DISK.size).toBeGreaterThan(100);
  });

  it('every voiced key resolves to a file that exists on disk', () => {
    const missing: string[] = [];
    for (const [key, rel] of Object.entries(NPC_LINE_AUDIO)) {
      const file = rel.split('/').pop() ?? '';
      if (!CLIPS_ON_DISK.has(file)) missing.push(`${rel}  <-  ${key}`);
    }
    expect(missing, `clips referenced by npcLineAudio.ts but absent from public/audio/lines`).toEqual([]);
  });

  it('every voiced key points inside audio/lines with an mp3 filename', () => {
    for (const [key, rel] of Object.entries(NPC_LINE_AUDIO)) {
      expect(rel, `path shape for ${key}`).toMatch(/^audio\/lines\/[A-Za-z0-9_]+\.mp3$/);
    }
  });

  it('every voiced key is still reachable from the line data (no orphaned recordings)', () => {
    const reachable = new Set(voiceableLines().map(({ npcId, text }) => `${npcId}|${text}`));
    const orphans = Object.keys(NPC_LINE_AUDIO).filter((key) => !reachable.has(key));
    expect(
      orphans,
      'a voiced line was reworded or deleted — restore the exact text or re-run scripts/generate-voices.mjs',
    ).toEqual([]);
  });

  it('no two keys share a clip file', () => {
    const files = Object.values(NPC_LINE_AUDIO);
    expect(new Set(files).size, 'duplicate clip paths in the manifest').toBe(files.length);
  });

  it('every clip on disk is still referenced by the manifest (nothing paid for is stranded)', () => {
    // The other direction of the orphan check: an mp3 nobody references means a
    // recording was paid for and then abandoned — almost always because its line
    // was reworded. Restore the exact text, or delete the clip deliberately.
    const referenced = new Set(Object.values(NPC_LINE_AUDIO).map((rel) => rel.split('/').pop() ?? ''));
    const stranded = [...CLIPS_ON_DISK].filter((file) => !referenced.has(file)).sort();
    expect(stranded, 'unreferenced clips in public/audio/lines').toEqual([]);
  });

  it('every NPC with a voice id keeps a body of voiced lines', () => {
    // Guards against a mass-deletion or a botched regeneration silencing a
    // character. Lines authored ahead of a voice pass are expected to be pending
    // — the generator is idempotent and picks them up (see VOICE_BATCH.md).
    for (const npcId of Object.keys(VOICE_IDS)) {
      const voiced = Object.keys(NPC_LINE_AUDIO).filter((key) => key.startsWith(`${npcId}|`)).length;
      expect(voiced, `${npcId} voiced line count`).toBeGreaterThanOrEqual(9);
    }
  });
});

describe('town dialogue data', () => {
  it('no duplicate line text within a single NPC', () => {
    const dupes: string[] = [];
    for (const [npcId, lines] of allLinesByNpc()) {
      const seen = new Map<string, string>();
      for (const { text, source } of lines) {
        const first = seen.get(text);
        if (first) dupes.push(`${npcId}: ${source} repeats ${first} — "${text}"`);
        else seen.set(text, source);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('no voiceable line contains a runtime slot (it would be recorded literally)', () => {
    const slotted = voiceableLines()
      .filter(({ text }) => /[{}]/.test(text))
      .map(({ npcId, source, text }) => `${npcId} ${source}: ${text}`);
    expect(slotted).toEqual([]);
  });

  it('every greeting stage offers at least four lines, so a chapter never loops', () => {
    for (const npc of NPCS) {
      expect(npc.greetings.length, `${npc.id} stages`).toBe(6);
      npc.greetings.forEach((pool, stage) => {
        expect(pool.length, `${npc.id} stage ${stage} variety`).toBeGreaterThanOrEqual(4);
      });
    }
  });

  it('every NPC carries at least 20 greeting lines across the arc', () => {
    for (const npc of NPCS) {
      expect(npc.greetings.flat().length, `${npc.id} greeting volume`).toBeGreaterThanOrEqual(20);
    }
  });

  it('extra spoken pools are deep enough to not repeat within a session', () => {
    for (const [npcId, lines] of Object.entries(EXTRA_VOICED_LINES)) {
      expect(NPC_IDS.has(npcId), `unknown npc id in EXTRA_VOICED_LINES: ${npcId}`).toBe(true);
      expect(lines.length, `${npcId} extra pool`).toBeGreaterThanOrEqual(9);
      for (const line of lines) expect(line.trim().length, `${npcId} extra line`).toBeGreaterThan(0);
    }
  });

  it('every NPC that hosts a service has an extra spoken pool (Grude and the Chronicler included)', () => {
    for (const npcId of Object.keys(SERVICE_BARKS)) {
      expect(EXTRA_VOICED_LINES[npcId], `${npcId} has service barks but no extra spoken pool`).toBeTruthy();
    }
  });

  it('service barks reference only known NPCs and only the {name}/{monster} slots', () => {
    for (const [npcId, pools] of Object.entries(SERVICE_BARKS)) {
      expect(NPC_IDS.has(npcId), `unknown npc id in SERVICE_BARKS: ${npcId}`).toBe(true);
      expect(pools.default.length, `${npcId} default bark pool`).toBeGreaterThanOrEqual(1);
      for (const lines of Object.values(pools)) {
        for (const line of lines ?? []) {
          for (const slot of line.match(/\{[a-zA-Z]+\}/g) ?? []) {
            expect(['{name}', '{monster}'], `${npcId} bark slot`).toContain(slot);
          }
        }
      }
    }
  });
});

describe('VOICE_BIBLE', () => {
  it('covers every NPC in the roster plus the Chronicler, and nobody else', () => {
    expect(new Set(Object.keys(VOICE_BIBLE))).toEqual(NPC_IDS);
  });

  it('every entry is filled in and self-consistent', () => {
    for (const [id, profile] of Object.entries(VOICE_BIBLE)) {
      expect(profile.id, `${id} id matches key`).toBe(id);
      expect(profile.name.length, `${id} name`).toBeGreaterThan(0);
      expect(profile.core.length, `${id} core`).toBeGreaterThan(20);
      expect(profile.speech.length, `${id} speech`).toBeGreaterThan(40);
      expect(profile.never.length, `${id} never`).toBeGreaterThan(20);
      expect(profile.direction.length, `${id} direction`).toBeGreaterThan(20);
      expect(profile.ballast.length, `${id} ballast`).toBeGreaterThanOrEqual(5);
    }
  });

  it('names match the roster where a roster entry exists', () => {
    for (const npc of NPCS) expect(VOICE_BIBLE[npc.id].name, `${npc.id} bible name`).toBe(npc.name);
  });
});

describe('voice id coverage', () => {
  it('every voice id belongs to a known NPC', () => {
    for (const npcId of Object.keys(VOICE_IDS)) {
      expect(NPC_IDS.has(npcId), `unknown npc id in npc_voices.json: ${npcId}`).toBe(true);
    }
  });

  // Documents the known gap rather than asserting it away. When Paul adds an id
  // for grude this test starts failing, which is the signal to delete it and let
  // the "voiced or newly authored" test above take over.
  //
  // 2026-07-25: the chronicler came off this list. His voice was never missing,
  // only unrecorded — "Deckard" (BkjG8thInSFJlI7Rkffc) had been used for
  // chronicler_0..2 and then written down nowhere. Paul confirmed it by ear and
  // his 12 remaining lines were generated against it.
  //
  // grude stays blocked on a voice SLOT, not a brief: the ElevenLabs account
  // caps at 10 custom voices and all 10 are spoken for. Her voice is designed
  // and auditioned; it cannot be saved until a slot frees or the plan is raised.
  it('records which NPCs are still waiting on a voice id', () => {
    const missing = [...NPC_IDS].filter((id) => !(VOICE_IDS as Record<string, string>)[id]).sort();
    expect(missing, 'see VOICE_BATCH.md — add ids, then re-run the generator').toEqual(['grude']);
  });
});
