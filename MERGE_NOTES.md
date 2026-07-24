# Merge: claude/v15-v17 ↔ origin/master (2026-07-24)

Everything from this session is SAFE on branch `claude/v15-v17` (commit 02b8b9e).
origin/master gained 5 Codex commits in parallel; do NOT deploy either side alone —
merge first. Conflicts: v5.css, floors.ts, types.ts, cardBattle.ts, GateSelectScreen.tsx
(+ FloorScreen/DeckScreen semantics).

## Resolution strategy (per-conflict)
1. **Fog of war — PREFER ORIGIN'S ENGINE.** Origin has `revealed[]` + `litTiles()` BFS
   lantern with LUCK radius + lit wall faces + `revealLantern()` — superior to this
   branch's Chebyshev `seen?[]`/`revealAround()`. DROP our engine fog (floors.ts fog
   section, game.ts revealAround calls, v15 fog tests) and REWIRE our FloorScreen
   presentation (fog cells, fringes, click guard) from `exp.seen`/`isSeen` →
   `exp.revealed`/`isRevealed`. Keep our fog RENDERING (war-table, .fog cells,
   fog-fringe) — origin's renderer is plainer.
2. **Keep ours everywhere in cardBattle.ts v15 additions** (actor fx events, winded
   feedback, +1 MP/round regen, full MP on victory) and types.ts `actor` FxEvent —
   origin's conflicts there are flavor-text-era line drift.
3. **GateSelectScreen:** keep ours (painted banner cards); re-apply any origin logic
   changes (Unmapped Wilds entry?) on top.
4. **DeckScreen:** origin added search + painted sort icons; ours (agent C) added
   filters/grid/count chips. UNION both features by hand.
5. **v5.css:** union — line-drift conflict only.
6. Keep origin's Unmapped Wilds (floorgen/SeededRng/WildParams) wholesale; our
   FloorScreen must call floorOf(exp) (it already does).
7. After merge: `npx tsc --noEmit`, `npx vitest run` (expect ~198+, rewrite v15 fog
   tests against isRevealed), `npm run build`, THEN deploy dist → gh-pages and ping.
