# PLAN6 — Everdusk: Unique Card Art → Playable → Multiplayer 1v1 → Client → Base On-Chain

Master roadmap for taking Everdusk's card game from single-player web build (v14) to a
multiplayer game with an installable client and on-chain assets on **Base**.
Phases are strictly ordered: each has an exit gate that must pass before the next starts.
Orchestrator (Claude) plans, QCs, and integrates; agents do production work; Grok is the
art department. Nothing is committed, pushed, released, or deployed without Paul's approval.

---

## Current state (audited 2026-07-23)

- Repo `repos/Rpg`, live at coffeecc.github.io/Rpg, v14 (installable auto-updating PWA).
- Engine: pure reducer (`web/src/engine/game.ts`, ~1.5k lines) + data-driven content
  (`engine/data/*`, ~200 card ids in `cards.ts`), card battle system in
  `engine/systems/cardBattle.ts`. 14 test files incl. `artSmoke`, `balanceSim`.
- Art: 107 card faces + 40 gear images in `web/public/art/`. **No byte-duplicates**, but:
  - ~95 cards have no dedicated face — `cardArt.ts` maps them to their monster's painting,
    so many cards visibly share identical art (worst offenders: multiple cards per monster).
  - Among the 106 dedicated faces, Grok produced visually near-identical compositions for
    similar briefs (needs visual clustering, not hashing).
- Grok pipeline proven (see memory `grok-art-pipeline`): v8.1 self-orchestration with
  BRIEF.md + file tools + `--max-turns 200` produced 128 correctly-labeled assets with its
  own QC. Staging in `web/art-staging/` (gitignored), never `web/public/`.

---

## Phase 1 — Unique card art (start immediately)

**Goal:** every card id resolves to a dedicated, visually distinct face appropriate to its
name and mechanics. Gear pass included.

1. **Contact sheet.** Script renders every entry in `CARD_ART` / gear art map into one HTML
   contact sheet (image + card id + card name + current source path). Orchestrator reviews
   it by eye and lists: (a) cards borrowing monster art, (b) look-alike clusters among
   dedicated faces, (c) faces that don't match the card's meaning.
2. **Brief authoring.** One brief per needed image (~95 borrowed + regeneration list from
   clustering). Each brief encodes the proven style rules (mood + palette + composition,
   "no text", painted style consistent with existing faces) **plus explicit differentiators**
   for cards in the same family: distinct action/pose, camera angle, palette accent, and
   subject framing so siblings can't converge. Cards derived from a monster keep the
   monster's identity but depict the *move/moment*, not the portrait.
3. **Grok production run.** Self-orchestration mode: BRIEF.md in `web/art-staging/`,
   `grok -p ... --always-approve --max-turns 200` with file tools; Grok names files by card
   id and emits manifest.json + QC_REPORT.md.
4. **Orchestrator QC (non-negotiable).** View every image with the Read tool — Grok's labels
   have been wrong before. Check: matches brief, no text artifacts, distinct from its
   siblings on a regenerated contact sheet. Reject/regenerate failures.
5. **Wire-in.** Copy approved images to `web/public/art/cards/`, regenerate `cardArt.ts`
   so every card id points at a dedicated file, run `artSmoke` test + full test suite,
   launch dev server and visually spot-check DeckScreen/BattleScreen/CardReward.

**Exit gate:** contact sheet shows zero shared faces, zero look-alike clusters; tests green;
in-game spot check passes. Present to Paul before commit.

## Phase 2 — Fully playable single-player

**Goal:** a new player can complete the intended game loop start→finish without dead ends.

**Progress 2026-07-23 (v15 playability pass, uncommitted):** fixed Paul's reported bugs —
real fog of war added (Chebyshev-2 lantern reveal, `Expedition.seen`, legacy saves stay
lit); object tiles no longer blacked out over painted terrain; map camera scrolls only the
grid (page no longer drifts); card-aim no longer reflows the battle stage; enemy/ally
turns paced ~½s/beat with per-actor name+move banners and figure glow; winded companions
announce themselves, regain 1 MP/round in battle and full MP after victory; boon cards
300px with readable type; monster sheet mid-run returns to the floor. Leveling verified
working (was old-build confusion) + level-up stage banner and party EXP display added.
Tests 198/198; production build clean; all fixes verified live in-browser.
Still open from Paul's list: door-lookalike tiles (needs Grok credits).

**Progress 2026-07-23 (v16 AAA presentation layer, uncommitted):** full-game UI/UX pass
driven by a headless-Edge screenshot audit harness (scratchpad/uiaudit — captures all 18
reachable screens; reusable for future UI work). Shipped: painted scene backdrops behind
every screen (gate art mid-expedition, town square otherwise); panels constrained/centered
as glass over the painting with anchored action rows and location-plaque titles; chronicle
log moved off the wasted bottom strip into the sidebar; global ↩ back chip in the HUD (a
stuck-navigation fix — Chronicle had no reachable Back); tavern → painted portrait gallery;
gate select → art-backed banner cards per gate; illustrated empty states; unified button
language; seamless fog rendering. Tests 198/198 after every step; before/after verified
via the harness. Remaining for later passes: bespoke polish on character sheet, deck,
chronicle interiors, victory/fallen/event screens (system-level lift applied, not yet
individually art-directed); mobile-width pass.

1. Audit PLAN.md–PLAN5.md against the implementation; produce a gap list (unimplemented
   systems, stubbed screens, broken transitions, missing content hooks).
2. Full playthrough smoke: forge a character, run gates, card battles, town services,
   breeding, quests, save/load mid-run, victory + fallen paths. Log every break.
3. Fix blockers (sessions own systems; agents author content per repo convention).
   Run `balanceSim` and adjust `balance.ts` outliers.
4. Save compatibility: version the save schema now (`saveGame.ts`) — multiplayer and chain
   phases will need stable serialization.

**Exit gate:** scripted end-to-end playthrough completes; all tests green; Paul plays a run
and signs off. This gate defines the ruleset multiplayer will freeze against.

## Phase 3 — Multiplayer 1v1

**Goal:** two players battle over the network with an authoritative server. Lobby codes
first; server browser second.

Architecture (leveraging the pure reducer):
- **Extract shared engine package** (`web/src/engine` → `packages/engine`) consumed by both
  client and server. No DOM imports in engine (audit + enforce with a lint rule).
- **Authoritative Node server** (`server/`): runs the reducer per match, owns the seeded RNG
  (`random.ts`), receives player *actions*, broadcasts *redacted* state views.
- **Hidden-information refactor — the real work:** today the client holds full state
  (opponent hand/deck order). Server must send per-player views: own hand, opponent
  hand-count, public zones. Reducer gets a `redactFor(playerId)` projection.
- **Protocol:** WebSocket; JSON actions with seq numbers; server validates legality via the
  reducer (illegal action → reject, no trust in client). Reconnect = resend redacted state.
- **Matchmaking v1:** create-lobby → 6-char code → friend joins. **v2:** server browser —
  a listable lobby registry endpoint + MultiplayerScreen UI (new main-menu entry).
- **Hosting:** local dev first; then TrueNAS (Docker, exposed via Tailscale Funnel like the
  ERP). Same server binary either way.
- **Testing:** bot-vs-bot integration test over real WebSockets (enemyAi as the driver);
  determinism test — same action log + seed ⇒ identical end state on client and server.

**Exit gate:** two browsers on separate machines complete a full 1v1 (incl. one forced
disconnect/reconnect); illegal-action injection is rejected; determinism test green.

## Phase 4 — Installable game client

**Goal:** official desktop client with installer.

- **Tauri** wrap of the web build (small binaries, no Chromium bundle; Rust toolchain is the
  only new dependency). Keep PWA as the browser path.
- Auto-update via Tauri updater fed by GitHub Releases.
- Windows installer `.exe` + build scripts in the release (house rule: every GitHub release
  ships the installer). Smoke-test the built binary — launch it and verify it survives
  first paint (house rule: unit tests don't catch OnLoad crashes).

**Exit gate:** clean-machine install → launch → complete an online 1v1. Release only on
Paul's approval.

## Phase 5 — On-chain on Base (testnet first)

**Goal:** cards + gear as NFTs, in-game currency as the game token, on Base. Precedent:
Gods Unchained on Immutable. **Everything ships against Base Sepolia; mainnet is a
separate, Paul-executed decision.**

1. **Contracts** (Foundry, OpenZeppelin):
   - `EverduskCards` — ERC-721 (card instances; tokenURI → metadata incl. card id, art).
   - `EverduskGear` — ERC-721 with affix data in metadata.
   - Game token — ERC-20, capped supply; emission only via game-server minter role.
   - Roles: server-held minter key (hot, low-privilege), Paul-held admin key (never on
     server, never handled by Claude).
2. **Bridge service** on the game server: wallet link (Sign-In-With-Ethereum), mint earned
   cards/currency, read chain ownership into the player's collection at login. Game stays
   fully playable without a wallet — chain assets are a layer, not a requirement.
3. **Metadata + art hosting:** IPFS pinning for card art/metadata (fallback: self-hosted
   on TrueNAS behind Funnel for testnet).
4. **Hard constraints:**
   - Legal/regulatory review before any mainnet token launch — a fungible game token can be
     a securities/money-transmission problem; this is Paul's homework, not a code task.
   - Claude writes/tests/deploys **testnet only**; never handles private keys, seed
     phrases, or real funds. Mainnet deploys, liquidity, listings = Paul, manually.
   - Robinhood Chain: revisit post-launch as a possible second deployment once it matures;
     Base-first, single source of truth for asset state.

**Exit gate:** on Base Sepolia — earn a card in-game → mint → visible in wallet → shows as
owned in-game on another client. Contract test suite green.

---

## Working agreements

- **QC:** orchestrator personally verifies every phase gate (eyes on art, hands on
  playthroughs, real-network multiplayer tests). Agent output is never trusted unreviewed.
- **Ship discipline:** build + verify, then present to Paul and wait; ping via Telegram
  after any approved push/release.
- **Scope guard:** no phase starts before the previous gate passes; server browser, second
  chain, spectating, ranked play are explicitly deferred features.

## Effort summary

| Phase | Size | Notes |
|---|---|---|
| 1 Art | 1–2 sessions | Grok compute-bound; QC is the human cost |
| 2 Playable | 2–5 sessions | Unknown until gap audit |
| 3 Multiplayer | 4–8 sessions | Hidden-info refactor + server + UI |
| 4 Client | 1 session | Tauri + installer |
| 5 Base | 3–5 sessions | Contracts + bridge; testnet only |
