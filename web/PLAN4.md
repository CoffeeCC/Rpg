# Everdusk v6 — Tactical Floors ("The March")

Paul's verdict: floors need Fire-Emblem-style tactics, quests need pacing,
cards must be EARNED deliberately, history minibosses, merchants, breakables,
secrets. Supersedes conflicting parts of PLAN3.md.

## Tactical movement (replaces random encounters entirely)
- Floors are TURN-BASED: the player moves up to MOV tiles, then every enemy
  unit moves. No more invisible random encounters — every fight is a visible
  unit on the map.
- **MOV = 4 + floor(DEX/15) + (boots equipped ? +1) + trait.moveBonus**
  (Thief Fleetfoot +1). Gear, race, class, and stats all touch movement.
- Enemy units: MOV 3, sight range 7 — they path toward the player when seen,
  else hold. Walking into a unit (or a unit reaching you) starts the card
  battle with that unit's pre-rolled group. Defeated units stay dead.
- Minibosses: MOV 2, guard the stairs — **the stairs refuse you until the
  floor's miniboss is dead.** Miniboss identity comes from GENERATED HISTORY:
  the gate's unslain famous beast if one haunts it, else "the Remnant of
  {historical figure}" — a boosted, named monster whose defeat is written
  into the Chronicle.
- Wandering tamers (some floors): rival monster-tamers with themed teams.
  Beating one grants a card Boon — fighting people who fight monsters is one
  of the deliberate ways to grow the deck.
- Traveling merchant: a chance per floor; bump into them to trade — small
  stock of consumables, one gear piece, and ONE purchasable card.
- Breakables (barrels/pots/crates): walk into them to smash — gold, herbs,
  sometimes nothing, rarely a card cache. Secrets ('s') sit off the beaten
  path, invisible until adjacent: best non-boss loot and card caches.
- Stairs 'S' also work upward: step back onto the entrance to ascend a floor
  (or exit to Everdusk from floor 1). The town is always reachable;
  expedition Boons still fade when you leave the gate.

## Map contract v2 (agent-authored, larger, deliberate)
Sizes 17×13 to 25×17. Legend: '#' wall, '.' floor, 'S' entrance/ascent,
'>' stairs down (miniboss-locked), 'B' gate boss (final floors), 'M' miniboss
(non-final floors, near the stairs), 'e' enemy unit spawn (3-6/floor),
't' tamer spawn (0-1, 40% chance), 'm' merchant spot (≤1, 50% chance),
'b' breakable (4-10), 'C' chest (1-3), 'H' shrine (0-1), 'E' event (0-2),
's' secret (1-2, dead-end placement). Reachability: everything reachable
from S treating breakables as passable-after-smash.

## Card acquisition (deliberate, never gifted)
Boons after ordinary victories are REMOVED. Cards now come only from:
1. Taming (species cards, as ever)
2. Card caches (secrets, rare breakables, some chests)
3. Rival tamers (wild duels; a town Tournament "The Proving" is the designed
   follow-up arena)
4. Minibosses and gate bosses
5. The traveling merchant (gold)

## Quest pacing
The board no longer dumps everything. Quests unlock progressively: 3 to
start, +1 per claimed quest, +2 per story chapter, ordered easy→hard. The
board says more work will come as your name grows.

## Status-effect feedback (mechanics verified working; perception fixed)
- Stunned/Frozen enemies show a 💫 STAGGERED intent instead of their attack.
- Chance-based status riders that fail to proc show a "resisted" popup.

## Save v4 (expedition now carries units/turn state; older saves rejected)
