# VOICE_BATCH — v20 town dialogue pass

Everdusk gained **140 new town greetings + 29 new spoken barks** (PLAN9 workstream
B). Text ships now and plays as text. This is the audio half: what to run, what
it will cost, and the one thing that is blocked on you.

Nothing here has been generated. **No ElevenLabs call was made** while authoring
this — the environment has no `ELEVENLABS_API_KEY` (verified), and the generator
reads the key from that variable only. It never reads `.elevenlabs.key`.

---

## 1. The command

From `web/`:

```powershell
# 1. see the plan, spend nothing (no key needed)
node scripts/generate-voices.mjs --dry-run

# 2. put the key in the environment for this shell only
$env:ELEVENLABS_API_KEY = (Get-Content .elevenlabs.key -Raw).Trim()

# 3. trial batch — five clips, then actually listen to them
node scripts/generate-voices.mjs --limit=5

# 4. the rest
node scripts/generate-voices.mjs
```

bash equivalent for step 2: `export ELEVENLABS_API_KEY="$(tr -d '\r\n' < .elevenlabs.key)"`

The run is **idempotent and resumable**. A clip that exists on disk and in the
manifest is never requested again, so re-running after a failure, a 429, or a
Ctrl-C costs nothing for what already landed. Interrupt it freely.

Other flags: `--only=dovey,bram`, `--delay=MS` (default 400), `--attempts=N`
(default 5, retries 429/5xx honouring `Retry-After`), `--help`.

Requires Node ≥ 22.18 — the script imports the `.ts` data files directly so the
lines have exactly one source of truth. You are on Node 24.14, fine.

---

## 2. What it will generate

| | clips | characters |
|---|---|---|
| Ready to generate now (9 NPCs with voice ids) | **126** | **13,184** |
| Blocked on a missing voice id (`grude`, `chronicler`) | 51 | 5,153 |
| **Total once both ids exist** | **177** | **18,337** |

That doubles the voiced corpus: 177 clips on disk today → 354 after a full pass.
Average line is 104 characters. On a character-billed plan, budget ~13.2k credits
for the unblocked batch and ~18.4k for everything.

### Per NPC

| NPC | clips | of which greetings | extra barks | characters | status |
|---|---|---|---|---|---|
| maribel | 14 | 14 | – | 1,637 | ready |
| ott | 14 | 14 | – | 1,546 | ready |
| rowan | 14 | 14 | – | 1,520 | ready |
| casque | 14 | 14 | – | 1,494 | ready |
| kess | 14 | 14 | – | 1,492 | ready |
| sess | 14 | 14 | – | 1,463 | ready |
| bram | 14 | 14 | – | 1,447 | ready |
| fennick | 14 | 14 | – | 1,330 | ready |
| dovey | 14 | 14 | – | 1,255 | ready |
| **grude** | **39** | 25 | 14 | 3,971 | **BLOCKED — no voice id** |
| **chronicler** | **12** | – | 12 | 1,182 | **BLOCKED — no voice id** |

Grude's 39 is the largest single block because *none* of his lines have ever been
voiced — his 11 original greetings plus 14 new ones plus his first extra pool.

---

## 3. BLOCKED: two NPCs have no voice id

`public/audio/npc_voices.json` holds **9** ids. The roster needs **11**.

```
dovey bram maribel ott kess casque rowan fennick sess   <- have ids
grude                                                   <- MISSING (known, PLAN9)
chronicler                                              <- MISSING (found during this pass)
```

**`grude` — Smith.** Never had an id, so she has always been silent. She is the
only townsperson who has never spoken aloud. **Blocked on a voice slot, not a
brief:** the ElevenLabs account caps at 10 custom voices and all 10 are in use
(9 mapped NPCs + the Chronicler's). Adding Grude needs an 11th — either free a
slot or raise the plan limit. Her voice has been designed and auditioned; only
the save is outstanding.

**`chronicler` — the archivist. RECOVERED, 2026-07-25.** The lost voice is
**`BkjG8thInSFJlI7Rkffc`**, named "Deckard" in the ElevenLabs library — it was
never written into `npc_voices.json` or any of the old python scripts, which is
why it read as missing. Paul confirmed by ear against `chronicler_0.mp3`. No
re-voicing is needed and the three existing clips stay.

The id is deliberately **not yet in `npc_voices.json`**: adding it without
generating his 12 pending clips leaves him with an id and only 3 voiced lines,
which trips the real invariant in `townVoice.test.ts` ("every NPC with a voice id
keeps a body of voiced lines"). Add the mapping and run the generator in the same
change, not separately.

### What I need from you

Add the two ids and re-run. Nothing else changes — the generator picks them up.

```json
{
  "dovey": "vnh0QBZJK0On6LiraKdK",
  ...
  "grude": "<voice id>",
  "chronicler": "<voice id>"
}
```

Either paste ids from voices you already have in the ElevenLabs library, or
design them from these directions (taken from `VOICE_BIBLE` in
`src/engine/data/npcs.ts`, same shape as the descriptions in `gen_voices.py`):

> **Grude** — "An older woman, heavyset and weathered by the forge, low and
> gravelled, patient and unhurried, with long pauses; she fitted armour to boys
> who did not come home and now talks to the metal instead. No self-pity, no
> volume."

Grude is a **woman** — see `public/art/npcs/grude.jpg` (v13, 2026-07-21). An
earlier draft of this file described her as male; that was never in VOICE_BIBLE
and never in her dialogue, which is entirely gender-neutral. Check the portrait
before writing a voice brief.

> **Chronicler** — "A faceless archivist, even and unhurried, neither warm nor
> cold; the narrator's voice. Reads a margin note half a step quieter than the
> line before it."

`src/engine/test/townVoice.test.ts` has a test that asserts exactly
`['chronicler', 'grude']` are missing. **It will go red when you add the ids —
that is the signal to delete that one test**, not a regression.

---

## 4. Notes on the pipeline

- **The audio key is the line text.** `${npcId}|${exact line}` → mp3. Rewording a
  voiced line orphans the recording you paid for. Two tests guard this in both
  directions (a key with no line, and a clip with no key).
- **New lines never renumber old clips.** Filenames are allocated above the
  current high-water mark per prefix, so the 14 new Dovey greetings become
  `dovey_11..dovey_24` and the existing `dovey_0..10` are untouched — even though
  the new lines are interleaved into the middle of her chapter pools.
- **No `voice_settings` are sent.** Same body the original `gen_lines.py` used:
  `{text, model_id: "eleven_v3"}`. Deliberate — adding stability/style knobs now
  would make the 177 new clips sound subtly unlike the 177 already on disk.
  Delivery lives in the writing and in the voice design, not in per-call knobs.
- **Rumors and service barks stay unvoiced.** They carry `{beast}`, `{monster}`,
  `{name}` slots filled at runtime; a recording would say the braces. The
  generator skips any line containing `{` and warns.
- **Clips are written `.part` → rename**, so a killed run cannot leave a
  truncated mp3 that the next run mistakes for a finished clip.
- `scripts/generate-voices.mjs` supersedes `gen_lines.py`,
  `redo_sess_extra_lines.py` and `redo_sess_voice.py` for line generation.

## 5. After the run

```powershell
npx vitest run src/engine/test/townVoice.test.ts   # clips resolve, no orphans
npm run build
```

`src/engine/data/npcLineAudio.ts` is rewritten by the script — review the diff,
it should be additions only.
