#!/usr/bin/env node
/**
 * generate-voices.mjs — ElevenLabs voice pass for Everdusk's town dialogue.
 *
 * Replaces the ad-hoc python scripts (gen_lines.py / redo_sess_voice.py) with
 * one idempotent, resumable pass:
 *
 *   1. reads the authored line data straight out of the .ts data files
 *   2. diffs it against the manifest in src/engine/data/npcLineAudio.ts AND
 *      against the .mp3 files actually on disk
 *   3. generates ONLY what is missing (eleven_v3, each NPC's own voice id)
 *   4. rewrites src/engine/data/npcLineAudio.ts
 *
 * The manifest key is `${npcId}|${exact line text}`, so a clip is identified by
 * what is said, not by where it sits in an array. That is what makes inserting
 * new lines into the middle of a greeting pool free: every existing key keeps
 * its existing file, and new lines are allocated fresh indices above the
 * current high-water mark. Nothing is ever re-billed.
 *
 * USAGE
 *   node scripts/generate-voices.mjs --dry-run          # plan + cost, no calls
 *   node scripts/generate-voices.mjs                    # generate everything missing
 *   node scripts/generate-voices.mjs --only=dovey,bram   # a couple of NPCs
 *   node scripts/generate-voices.mjs --limit=5           # trial batch, then listen
 *
 * The API key comes from the environment and nowhere else:
 *   PowerShell:  $env:ELEVENLABS_API_KEY = (Get-Content .elevenlabs.key -Raw).Trim()
 *   bash:        export ELEVENLABS_API_KEY="$(tr -d '\r\n' < .elevenlabs.key)"
 * --dry-run needs no key at all.
 *
 * Requires Node >= 22.18 (native TypeScript type stripping — this script
 * imports the .ts data files directly, so there is exactly one source of truth
 * for the lines).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = join(ROOT, 'src', 'engine', 'data');
const LINES_DIR = join(ROOT, 'public', 'audio', 'lines');
const VOICES_JSON = join(ROOT, 'public', 'audio', 'npc_voices.json');
const MANIFEST_TS = join(DATA, 'npcLineAudio.ts');

const MODEL_ID = 'eleven_v3';
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
/** ElevenLabs bills per character; this is only for the estimate we print. */
const CREDITS_PER_CHAR = 1;

// ---------------------------------------------------------------- args ------

function parseArgs(argv) {
  const opts = { dryRun: false, only: null, limit: Infinity, delayMs: 400, maxAttempts: 5 };
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--only=')) opts.only = new Set(arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice(8));
    else if (arg.startsWith('--delay=')) opts.delayMs = Number(arg.slice(8));
    else if (arg.startsWith('--attempts=')) opts.maxAttempts = Number(arg.slice(11));
    else {
      console.error(`unknown argument: ${arg}  (try --help)`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.limit) && opts.limit !== Infinity) fail('--limit must be a number');
  if (!Number.isFinite(opts.delayMs)) fail('--delay must be a number of milliseconds');
  return opts;
}

const HELP = `generate-voices.mjs — voice the town dialogue with ElevenLabs (${MODEL_ID}).

  --dry-run, -n      print the plan and the character/credit estimate; no API
                     calls, no files written, no key required
  --only=a,b         restrict to these npc ids
  --limit=N          generate at most N clips this run (trial batches; the run
                     is resumable, so the rest are picked up next time)
  --delay=MS         pause between requests (default 400)
  --attempts=N       retry attempts per clip on 429/5xx (default 5)
  --help, -h         this

Key: process.env.ELEVENLABS_API_KEY only. The script never reads a key file.`;

function fail(msg) {
  console.error(`\n  ERROR: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- data ------

/** Import a .ts data module directly (Node native type stripping). */
async function importData(file) {
  const url = pathToFileURL(join(DATA, file)).href;
  try {
    return await import(url);
  } catch (err) {
    if (String(err?.message ?? '').match(/Unknown file extension|strip.?types|ERR_UNSUPPORTED/i)) {
      fail(
        `cannot import ${file} — this script needs Node >= 22.18 for native TypeScript\n` +
        `  type stripping. Running Node ${process.version}. Upgrade Node, or run with\n` +
        `  --experimental-strip-types.`,
      );
    }
    throw err;
  }
}

/**
 * Every line we are willing to send to TTS, in a stable canonical order:
 * greetings first (roster order, chapter order), then the extra spoken pools.
 *
 * NOT included: `rumors` and SERVICE_BARKS. Both carry {slots} filled in at
 * runtime, so a recording of them would be a recording of the literal braces.
 * Slotted lines stay text-only by design — the guard below enforces it.
 */
async function collectTargets() {
  const { NPCS } = await importData('npcs.ts');
  const { EXTRA_VOICED_LINES } = await importData('extraDialogue.ts');

  const targets = [];
  const seen = new Set();
  const push = (npcId, prefix, text, source) => {
    if (text.includes('{') || text.includes('}')) {
      console.warn(`  ! skipping slotted line (cannot be voiced): ${npcId} — ${text}`);
      return;
    }
    const key = `${npcId}|${text}`;
    if (seen.has(key)) {
      console.warn(`  ! duplicate line text within ${npcId}, voicing once: ${text}`);
      return;
    }
    seen.add(key);
    targets.push({ npcId, prefix, text, key, source });
  };

  for (const npc of NPCS) {
    for (const pool of npc.greetings) for (const line of pool) push(npc.id, npc.id, line, 'greeting');
  }
  for (const [npcId, lines] of Object.entries(EXTRA_VOICED_LINES)) {
    for (const line of lines) push(npcId, `extra_${npcId}`, line, 'extra');
  }
  return targets;
}

/** The manifest as it stands (key -> "audio/lines/x.mp3"). */
async function loadManifest() {
  const mod = await importData('npcLineAudio.ts');
  return { ...mod.NPC_LINE_AUDIO };
}

function loadVoiceIds() {
  if (!existsSync(VOICES_JSON)) fail(`missing ${VOICES_JSON}`);
  return JSON.parse(readFileSync(VOICES_JSON, 'utf8'));
}

// ------------------------------------------------------------ filenames -----

/**
 * Next free index for a filename prefix, considering both the manifest and the
 * directory listing — so a clip generated by an earlier interrupted run is
 * never overwritten and never re-billed.
 */
function makeIndexAllocator(manifest, filesOnDisk) {
  const high = new Map();
  const note = (name) => {
    const m = /^(.*)_(\d+)\.mp3$/.exec(name);
    if (!m) return;
    const [, prefix, n] = m;
    high.set(prefix, Math.max(high.get(prefix) ?? -1, Number(n)));
  };
  for (const file of filesOnDisk) note(file);
  for (const rel of Object.values(manifest)) note(rel.split('/').pop() ?? '');
  return (prefix) => {
    const next = (high.get(prefix) ?? -1) + 1;
    high.set(prefix, next);
    return next;
  };
}

// ------------------------------------------------------------------ tts -----

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function looksLikeMp3(buf) {
  if (buf.length < 512) return false; // no real line is this short
  return (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
}

/**
 * One clip. Retries 429 (honouring Retry-After) and 5xx with exponential
 * backoff + jitter; 4xx other than 429 is a hard failure (bad voice id, bad
 * key, quota exhausted) and stops the run so we do not hammer a dead endpoint.
 */
async function synthesize({ apiKey, voiceId, text, attempts, delayMs }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: MODEL_ID }),
      });
    } catch (err) {
      if (attempt === attempts) throw err;
      const wait = Math.round(delayMs * 2 ** attempt + Math.random() * 250);
      console.warn(`    network error (${err.message}); retry ${attempt}/${attempts - 1} in ${wait}ms`);
      await sleep(wait);
      continue;
    }

    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (!looksLikeMp3(buf)) throw new Error(`response was not mp3 audio (${buf.length} bytes)`);
      return buf;
    }

    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => '');
    if (!retryable || attempt === attempts) {
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.round(delayMs * 2 ** attempt + Math.random() * 250);
    console.warn(`    HTTP ${res.status}; retry ${attempt}/${attempts - 1} in ${wait}ms`);
    await sleep(wait);
  }
  throw new Error('unreachable');
}

/** Write via .part + rename so an interrupted run never leaves a half clip. */
function writeClip(dest, buf) {
  const part = `${dest}.part`;
  writeFileSync(part, buf);
  try {
    renameSync(part, dest);
  } catch (err) {
    try { unlinkSync(part); } catch { /* best effort */ }
    throw err;
  }
}

// ------------------------------------------------------------- manifest -----

function emitManifest(orderedEntries) {
  const obj = {};
  for (const [key, rel] of orderedEntries) obj[key] = rel;
  const body = JSON.stringify(obj, null, 1);
  return (
    '// AUTO-GENERATED: voiced NPC greeting lines (ElevenLabs eleven_v3, per-NPC voice).\n' +
    '// Key: `${npcId}|${exact line text}`. Rumors are dynamic and stay unvoiced.\n' +
    '// Regenerate with: node scripts/generate-voices.mjs   (see art-staging/VOICE_BATCH.md)\n' +
    `export const NPC_LINE_AUDIO: Record<string, string> = ${body};\n`
  );
}

// ------------------------------------------------------------------ main ----

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const targets = await collectTargets();
  const manifest = await loadManifest();
  const voiceIds = loadVoiceIds();
  mkdirSync(LINES_DIR, { recursive: true });
  const filesOnDisk = readdirSync(LINES_DIR).filter((f) => f.endsWith('.mp3'));
  const onDisk = new Set(filesOnDisk);
  const nextIndex = makeIndexAllocator(manifest, filesOnDisk);

  const selected = opts.only ? targets.filter((t) => opts.only.has(t.npcId)) : targets;
  if (opts.only) {
    const known = new Set(targets.map((t) => t.npcId));
    for (const id of opts.only) if (!known.has(id)) console.warn(`  ! --only=${id}: no lines found for that npc id`);
  }

  /** Already voiced: in the manifest AND the file is really there. */
  const keep = [];
  const todo = [];
  const noVoice = new Map(); // npcId -> pending line count
  for (const t of selected) {
    const rel = manifest[t.key];
    if (rel && onDisk.has(rel.split('/').pop() ?? '')) {
      keep.push([t.key, rel]);
      continue;
    }
    if (!voiceIds[t.npcId]) {
      noVoice.set(t.npcId, (noVoice.get(t.npcId) ?? 0) + 1);
      continue;
    }
    todo.push(t);
  }

  // Keys in the manifest that no data file claims any more (a line was reworded
  // or removed). The mp3 stays on disk; the entry is dropped so the shipped
  // manifest never points at a line nobody says.
  const claimed = new Set(targets.map((t) => t.key));
  const orphans = Object.keys(manifest).filter((k) => !claimed.has(k));

  // ---- report
  const byNpc = new Map();
  for (const t of todo) {
    const row = byNpc.get(t.npcId) ?? { clips: 0, chars: 0 };
    row.clips++;
    row.chars += t.text.length;
    byNpc.set(t.npcId, row);
  }
  const totalChars = todo.reduce((n, t) => n + t.text.length, 0);

  console.log(`\nEverdusk voice pass — model ${MODEL_ID}`);
  console.log(`  lines authored ......... ${targets.length}${opts.only ? ` (${selected.length} selected)` : ''}`);
  console.log(`  already voiced ......... ${keep.length}`);
  console.log(`  to generate ............ ${todo.length}`);
  console.log(`  characters ............. ${totalChars} (~${totalChars * CREDITS_PER_CHAR} credits)`);
  if (orphans.length) console.log(`  stale manifest entries . ${orphans.length} (dropped from npcLineAudio.ts)`);
  if (byNpc.size) {
    console.log('\n  per NPC:');
    for (const [npcId, row] of [...byNpc].sort((a, b) => b[1].clips - a[1].clips)) {
      console.log(`    ${npcId.padEnd(12)} ${String(row.clips).padStart(4)} clips  ${String(row.chars).padStart(6)} chars`);
    }
  }
  if (noVoice.size) {
    console.log('\n  !! NO VOICE ID — these NPCs cannot be generated:');
    for (const [npcId, count] of noVoice) {
      console.log(`    ${npcId.padEnd(12)} ${String(count).padStart(4)} lines waiting`);
    }
    console.log(`    Add an id to public/audio/npc_voices.json and re-run. Nothing else changes.`);
  }

  if (opts.dryRun) {
    console.log('\n  --dry-run: no API calls made, no files written.\n');
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    fail(
      'ELEVENLABS_API_KEY is not set.\n' +
      "  PowerShell:  $env:ELEVENLABS_API_KEY = (Get-Content .elevenlabs.key -Raw).Trim()\n" +
      "  bash:        export ELEVENLABS_API_KEY=\"$(tr -d '\\r\\n' < .elevenlabs.key)\"\n" +
      '  Or use --dry-run to see the plan without a key.',
    );
  }

  const batch = todo.slice(0, opts.limit);
  if (batch.length < todo.length) console.log(`\n  --limit=${opts.limit}: generating ${batch.length} of ${todo.length} this run.`);

  const fresh = [];
  let done = 0;
  for (const t of batch) {
    const index = nextIndex(t.prefix);
    const file = `${t.prefix}_${index}.mp3`;
    const rel = `audio/lines/${file}`;
    done++;
    console.log(`  [${done}/${batch.length}] ${file} — ${t.text.length} chars`);
    let buf;
    try {
      buf = await synthesize({
        apiKey,
        voiceId: voiceIds[t.npcId],
        text: t.text,
        attempts: opts.maxAttempts,
        delayMs: opts.delayMs,
      });
    } catch (err) {
      console.error(`\n  FAILED on ${t.npcId}: ${err.message}`);
      console.error('  Writing the manifest for everything generated so far, then stopping.');
      console.error('  Re-run the same command to resume — finished clips are never re-billed.\n');
      break;
    }
    writeClip(join(LINES_DIR, file), buf);
    fresh.push([t.key, rel]);
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  // ---- rewrite the manifest in canonical target order
  const resolved = new Map([...Object.entries(manifest), ...keep, ...fresh]);
  const ordered = targets.map((t) => [t.key, resolved.get(t.key)]).filter(([, rel]) => Boolean(rel));
  const before = readFileSync(MANIFEST_TS, 'utf8');
  const after = emitManifest(ordered);
  if (before === after) {
    console.log(`\n  ${fresh.length} new clips. npcLineAudio.ts unchanged.\n`);
    return;
  }
  writeFileSync(MANIFEST_TS, after, 'utf8');
  console.log(`\n  ${fresh.length} new clips. npcLineAudio.ts rewritten — ${ordered.length} voiced lines.\n`);
}

await main();
