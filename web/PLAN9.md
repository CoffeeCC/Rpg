# PLAN9 — v20: duels fight on the real battlefield + a town that talks

Paul, 2026-07-24: "Why is the duel screen so different from our regular battle screen? its
just like fighting in a menu? cant it be the same? and can we generate more lines of
dialogue for all of our characters? and give them some personality. then use the elevenlabs
for the new voices."

Orchestrator's note: workstream A is a correction of a v19 QC miss — the duel agent built a
parallel combat UI (MultiplayerScreen.tsx + duel.css) instead of reusing BattleScreen, and
that was approved. A duel IS a battle; there must be exactly ONE battlefield renderer.

## Workstream A — one battlefield, two sources of truth
**Owns:** src/components/BattleScreen.tsx, src/battle.css, src/components/MultiplayerScreen.tsx,
src/duel.css, src/engine/systems/duel.ts, src/engine/test/duel.test.ts.

Goal: a duel renders in the SAME BattleScreen the single-player game uses — painted backdrop,
top/bottom battlefield rows, dueling portraits, candle vigor rail, MTG-scale piles, corner
lantern end-turn, hand fan, FX pacing, actor banners, damage popups, impact FX. The
multiplayer screen keeps ONLY pre-match (mode select, rival select, party/deck setup) and
post-match (result, rematch, return).

1. **Refactor BattleScreen to be source-agnostic.** It currently reads `state.battle` /
   `state.player` / `state.party` and dispatches `GameAction`s. Introduce a view-model seam:
   BattleScreen takes what it needs to render plus a small command interface
   (`playCard(handIndex, targetUid)`, `endTurn()`, `useItem()`, `flee()/concede()`,
   `mercy...`). Single-player passes a GameState-backed adapter; the duel passes a
   DuelView-backed adapter that calls `transport.submitAction(...)`.
2. **Single-player must stay byte-identical in behavior** — every existing dispatch, the
   staggered FX playback, aim/targeting, keyboard + gamepad, target hint, log rail, candle
   rail. If a duel lacks a feature (tame/mercy/flee-vs-concede, items), the adapter reports
   it unavailable and the UI hides that control rather than the two renderers forking.
3. **Duel-specific chrome via a flag/variant**, not a fork: rival name + portrait in the
   enemy portrait chip, "concede" instead of "flee", round/turn indicator, and the
   opponent's redacted hand shown as face-down card backs (never real cards — the
   redaction boundary in `viewFor` must not be weakened; assert it in a test).
4. Delete whatever in duel.css becomes dead once the real battlefield renders the fight.
   Keep the setup/result styling. Note: `.duel-chip` was renamed to `.bf-portrait` in
   battle.css during v19 because duel.css was overriding battle portraits — do not
   reintroduce a collision; run a class-collision check before finishing.
5. Tests: existing 253 stay green; add coverage that the duel adapter produces the same
   legal actions the transport accepts, and that the opponent's hand contents never reach
   the view model.

## Workstream B — dialogue, personality, and voices
**Owns:** src/engine/data/npcs.ts, extraDialogue.ts, serviceBarks.ts, personalities.ts,
src/engine/data/npcLineAudio.ts (regeneration only), NEW scripts/generate-voices.mjs,
NEW web/art-staging/VOICE_BATCH.md, tests under src/engine/test/.

Current state: 10 town NPCs with authored greetings; **177 voiced clips** already exist
(`public/audio/lines/*.mp3`), keyed `${npcId}|${exact line text}` in npcLineAudio.ts.
Voices are ElevenLabs `eleven_v3` with per-NPC voice IDs in `public/audio/npc_voices.json`
(9 ids — **`grude` has no voice id**; flag it).

6. **Expand dialogue substantially** — target ~12-20 new lines per town NPC, written to a
   documented voice-and-personality bible so each character is unmistakable: Dovey (warm,
   deadpan, proud of her roof), Bram (clipped ledger-speak), Maribel (dotty, unnervingly
   precise), Ott (blunt animal-first pragmatism), Kess (needling rival), Casque (gentle
   fanatic), Rowan (ancient, measures time in rings), Fennick (cheerful gravedigger),
   Sess (counts who returns), Grude (dry craftsman), the Chronicler (faceless archivist).
   Lines must react to orb-count progression like the existing ones do, and stay in the
   established prose voice (dry, elegiac, never quippy-modern).
7. **Personality for the monsters too.** The 8 personalities in personalities.ts already
   drive combat instincts — give them barks: a line when their instinct fires, when they're
   winded, when they level, when tamed. Wire them where the engine already has the hook
   (INSTINCT_LABEL is the precedent). Keep it data-only; no combat logic changes.
8. **Voice generation script** `scripts/generate-voices.mjs`: reads the line data, diffs
   against existing clips, calls ElevenLabs `eleven_v3` with each NPC's voice id, writes
   `public/audio/lines/<npc>_<n>.mp3`, and regenerates npcLineAudio.ts. Must be idempotent
   (never re-bill for an existing clip), rate-limit aware, `--dry-run` capable, and read the
   key from `ELEVENLABS_API_KEY` env var only.
   **DO NOT call the API and DO NOT invent a key.** There is no key in this environment —
   verify that, then leave the script ready to run and write VOICE_BATCH.md documenting the
   exact command, expected clip count, and the missing `grude` voice id.
9. Tests: every voiced key resolves to a real file; every new line is reachable from data;
   no duplicate line text within an NPC.

## Verification bar (both)
`npx tsc --noEmit` clean, `npx vitest run` all green (253 baseline + new), production build
clean, no dev servers left running, no commits.
