# PLAN8 — v19: polish, atmosphere, and the road to multiplayer

Paul's playtest 2026-07-24 (post-v18). Ownership is strict — no agent edits another's files.
Tokens as always: gold rgba(200,162,74,*), var(--font-display), glass rgba(17,13,10,.88).
Verification bar for every agent: `npx tsc --noEmit` clean + `npx vitest run` all green,
presentation/additive only unless stated, no commits, no dev servers left running.

## Agent A — Battle viewport (BattleScreen.tsx, battle.css, LanternTurn.tsx, CardView.tsx)
1. **Duel portraits overlap the combatant rows.** The enlarged (96px) portrait chips now
   collide with the enemy row above and party row below. Re-solve the vertical stack so
   portrait chips, rows, nameplates, and intent telegraphs never overlap at any height.
2. **Zoom the whole stage out ~20%.** Paul: it reads scrunched/zoomed-in; browser zoom-out
   scales better. Scale the battlefield as a system (figures, portraits, plates, rows) so
   more air surrounds everything — NOT by shrinking text into illegibility. Consider a
   root `--bf-scale` token that sizes figures/chips/plates together, with the hand kept
   readable.
3. **Names and images don't fit** their plates/frames (clipping, overflow). Audit every
   label in battle: enemy nameplates, ally plates, intent move names, status tags —
   fit-to-content with graceful truncation + title tooltips.
4. Preserve: FX pacing/actor banners/.acting/.pre-target, targeting refs + data-enemy-uid,
   keyboard/gamepad, fixed-height target hint, log rail, candle rail.

## Agent B — Expedition map readability (FloorScreen.tsx, floor.css, art/tileArt.tsx)
5. **Fake doors — ROOT CAUSE FOUND:** `TILE_PROPS = ['waterpool','debris','archway']` in
   art/tileArt.tsx sprinkles a purely decorative **archway** on ~1 in 15 floor tiles
   (`pickTileProp`), which reads exactly like the real 🚪 START/way-back tile. Remove
   'archway' from the rotation (replace with an unambiguous ground prop — roots, rubble,
   bones, moss patch). Decorative props must never mimic an interactive tile.
6. **Bigger tiles + bigger tile contents.** Desktop cell 64px → ~84-96px, and scale what
   sits ON tiles proportionally (unit sprites, chest/shrine/event/stairs/barrel icons,
   player token) — Paul: "very hard to tell what is what". Keep the `--cell` token as the
   single source of truth incl. wall-texture math; grid scrolls internally when the floor
   exceeds the viewport (camera-follow already handles it).
7. **Page still scrolls on the map screen.** v18 fixed the shell (`overflow: clip`) but
   something on this screen still moves the viewport. Reproduce with a headless harness
   (scratchpad/uiaudit, puppeteer-core + Edge), find the true cause, fix it, and prove it
   with a before/after scrollTop measurement.

## Agent C — Music + battle transition (platform/music.ts NEW, App.tsx, BattleScreen.tsx hook, v16.css/battle.css transition styles)
8. **Background music, three contexts:** town/menus, expedition/map, battle. The codebase
   philosophy is **zero-asset WebAudio synthesis** (see platform/sfx.ts) — follow it: build
   `platform/music.ts` that synthesizes looping layered ambience (drones, sparse motifs,
   percussion for battle) per context, with smooth crossfades on context change, honoring
   the existing mute toggle (`isMuted`/`setMuted`) and adding a separate music volume/
   mute so SFX and music are independent. Must start only after a user gesture
   (AudioContext policy) and never throw — audio is a garnish, never breaks the game.
9. **Map→battle transition is jarring.** RESEARCH FIRST (WebSearch/WebFetch): how retro
   RPGs handle encounter transitions — Final Fantasy (spiral/swirl wipe, screen shatter),
   Pokémon (flash + varied wipes: checkerboard, curtain, spiral), Chrono Trigger (seamless
   zoom-in, no cut), EarthBound (psychedelic warps), Golden Sun, Octopath. Pick 2-3 that
   suit a dark painted card-RPG, implement the best as the default (CSS/SVG/canvas — no new
   deps), with the existing iris/flash as fallback. Sell it: brief freeze, effect, then
   battle fades in. ~0.8-1.2s total, skippable by input. Also handle battle→map return.

## Agent D — Multiplayer 1v1 foundation (NEW: components/MultiplayerScreen.tsx, engine/systems/duel.ts, engine/data/duelParty.ts; TOUCH: engine/game.ts + types.ts for screen/actions ONLY, TownScreen.tsx for the menu entry)
10. **New menu:** a Multiplayer entry from town/main → MultiplayerScreen with modes:
    **Duel (vs AI)** playable NOW, and **Versus (online)** visibly present but disabled/
    "coming soon" until the server lands. Design it as the future server-browser shell.
11. **Players need a party to fight with.** Duel setup screen: pick your hero + up to N
    party monsters + deck preview, versus a generated opponent (mirror-matched by level, or
    a roster of authored rival tamers). Reuse existing Character/MonsterInstance/buildDeck.
12. **Architecture that survives netcode:** the duel runs the SAME pure reducer/cardBattle
    systems. Put every match interaction behind a transport interface (e.g.
    `DuelTransport { submitAction(); onState(); }`) with a `LocalTransport` (AI opponent,
    ships now) so a `WebSocketTransport` drops in later without touching UI. Opponent
    decisions come from an authored duel AI (reuse enemyAi weighting where sensible).
    Include a determinism test: same seed + same action log ⇒ identical end state.
13. Ship it PLAYABLE vs AI end-to-end (enter menu → build party → duel → win/lose →
    return), with tests for duel setup, transport, and determinism. Do NOT build a server,
    do NOT add network deps.
