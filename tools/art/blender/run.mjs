// Find Blender and run the baker, so `npm run art:board` works on a fresh
// machine.
//
// The Windows installer does NOT put blender.exe on PATH, so the obvious
// script — `blender --background --python ...` — fails with a bare "not
// recognized" on the one platform this project is developed on. That is a
// papercut that costs everyone who clones the repo ten minutes.
//
// PATH is still tried FIRST, because that is correct for CI, for Linux and
// macOS, and for anyone who installed deliberately. The hard-coded locations
// are a fallback, not the plan.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { publishAll } from './publish.mjs';

const FALLBACK_ROOTS = [
  'C:/Program Files/Blender Foundation',
  'C:/Program Files (x86)/Blender Foundation',
  `${process.env.LOCALAPPDATA ?? ''}/Programs/Blender Foundation`,
  '/Applications/Blender.app/Contents/MacOS',
  '/usr/bin',
  '/usr/local/bin',
];

function onPath() {
  const probe = spawnSync('blender', ['--version'], { encoding: 'utf8' });
  return probe.status === 0 ? 'blender' : null;
}

/** Newest version directory wins, so a Blender upgrade does not need a code change. */
function search() {
  for (const root of FALLBACK_ROOTS) {
    if (!existsSync(root)) continue;
    const direct = [path.join(root, 'blender.exe'), path.join(root, 'blender')].find(existsSync);
    if (direct) return direct;
    const versions = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
    for (const v of versions) {
      const exe = [path.join(root, v, 'blender.exe'), path.join(root, v, 'blender')].find(existsSync);
      if (exe) return exe;
    }
  }
  return null;
}

const blender = onPath() ?? search();
if (!blender) {
  console.error(
    'Blender not found.\n' +
      '  Install it (winget install --id BlenderFoundation.Blender -e), or put blender on PATH.\n' +
      '  Looked in: ' + FALLBACK_ROOTS.join(', '),
  );
  process.exit(1);
}

const script = path.join('tools', 'art', 'blender', 'bake.py');
const args = ['--background', '--python', script, '--', ...process.argv.slice(2)];
console.log(`[art:board] ${blender}`);
const run = spawnSync(blender, args, { stdio: 'inherit' });
if (run.status === 0) {
  // Staging is gitignored and unreachable from a build; publish the maps the
  // renderer samples into web/public/ so one command is enough to make new
  // furniture — or a new card layer — visible in-game. `publishAll` publishes
  // whichever staging trees exist, so this is right whether the bake that just
  // finished was the board's or the card set's.
  publishAll();
}
process.exit(run.status ?? 1);
