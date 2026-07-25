import type { FamousBeast, GeneratedWorld, WorldFigure } from '../types';
import type { FallenTelling } from '../../platform/tellings';
import { ordinal } from './tellingsLore';
import { GATES } from './gates';
import type { GateId } from '../types';

// =========================================================================
// LEAVINGS — the floor remembers who walked it.
//
// The world already knew a great deal about its dead and said almost none of
// it out loud. `generateWorld` gives every figure a role, a fate line, a year
// they died, and — the part that matters — CAUSAL THREADS: who taught them,
// who opposed them, which famous beast ended them. Until now the only place
// any of that surfaced in the dungeon was a miniboss label reading "Remnant
// of {name} {title}", which is a name with no story attached.
//
// A leaving is the story attached. It is a small, ownerless object on a floor
// tile — a shield propped where someone set it down, a satchel gone to pulp,
// a cairn — with an author, and the author is real: a figure the Chronicle
// can be checked against, one of YOUR OWN fallen tellings, or nobody at all.
//
// Three authors, and the split is the whole design:
//
//   TELLING  — you did this. A previous run of yours ended somewhere, and the
//              book recorded where. Finding your own body is the oldest trick
//              in this genre and it works because the record is not invented:
//              it is the same epitaph the Chronicler wrote when you died.
//
//   FIGURE   — someone in the generated history did this, and the leaving
//              says which of the threads on them is the reason. If a beast
//              killed them and that beast is still in this gate, the leaving
//              says so, and the player can go and check.
//
//   NAMELESS — nobody the history bothered to name. Present on purpose. A
//              world where every trace has a famous owner is a world with
//              about forty people in it; the nameless are what make the other
//              two land as exceptions rather than as the rule.
// =========================================================================

export type LeavingKind = 'telling' | 'figure' | 'nameless';

export interface Leaving {
  kind: LeavingKind;
  /** What you are looking at. "A Shield, Propped." */
  name: string;
  /** Who left it, in plain words. Null when the answer is nobody knows. */
  author: string | null;
  /** The body of it. One short paragraph per entry. */
  passage: string[];
  /** One line for the run log — the leaving must read without the overlay. */
  logLine: string;
  /** Which of your tellings this was, when kind is 'telling'. */
  tellingNumber?: number;
}

// -------------------------------------------------------------------------
// The nameless
// -------------------------------------------------------------------------

/**
 * Ordinary people, and the evidence that they were here first.
 *
 * These carry no name and never will, and each one is written so that the
 * absence is the point rather than a gap where a name failed to load.
 */
const NAMELESS: { name: string; passage: string[] }[] = [
  {
    name: 'A Worn Place on the Stone',
    passage: [
      'Someone sat here. Not once — enough times that the stone took the shape of it, which is a thing stone does slowly and without being asked.',
      'They had a view of the corridor from here. They would have seen anything coming with time enough to stand up. Whether they ever did stand up is not recorded, because nobody was recording.',
    ],
  },
  {
    name: 'Three Marks at Shoulder Height',
    passage: [
      'Three scratches in the wall, level with your shoulder, made with something harder than a knife and softer than a sword.',
      'Counting is the first thing anyone does down here. Days, or corners, or the ones that got away. The count stopped at three, and the wall does not say why a count stops.',
    ],
  },
  {
    name: 'A Fire, Long Cold',
    passage: [
      'A ring of stones with ash in it, dry as paper. Someone carried the wood down here, which is harder than carrying a lamp and means they meant to stay.',
      'The stones are stacked neatly. Whoever built it expected to come back and use it again, and packing up carefully is a thing people do right up until the last time.',
    ],
  },
  {
    name: 'A Boot, Alone',
    passage: [
      'One boot, upright, laced. Good repair. The other one is not here and there is no polite explanation for that.',
      'It is a small size. You put the thought away where you keep the other ones.',
    ],
  },
  {
    name: 'A Door Wedged Open',
    passage: [
      'A stone jammed under a door that swings shut on its own, put there by someone who did not intend to be on the wrong side of it.',
      'The stone is still holding. It has outlasted the argument it was making.',
    ],
  },
  {
    name: 'Names Not Meant for Reading',
    passage: [
      'Two names cut into the lintel, close together, with nothing else around them. No date, no epitaph, no explanation, because whoever cut them already knew all of it.',
      'The letters are shallow and unsteady. It took a long time and they were not a mason.',
    ],
  },
];

// -------------------------------------------------------------------------
// The figures
// -------------------------------------------------------------------------

/**
 * What each kind of person leaves behind them.
 *
 * Keyed on `FigureRole`, because the role is already the most characterful
 * thing worldgen decides about a person and it is wasted on a title. A
 * tamer's leaving should be recognisable as a tamer's before the name is read.
 */
const FIGURE_OBJECTS: Record<WorldFigure['role'], { name: string; found: string }[]> = {
  tamer: [
    { name: 'An Empty Leash', found: 'A leash, coiled and tied off neatly at the end, the way you tie one you expect to use again. The collar is stretched. Whatever wore it was still growing.' },
    { name: 'A Feeding Tin', found: 'A tin scraped clean on the inside and gnawed on the outside, which is two different appetites and one of them was patient about it.' },
  ],
  knight: [
    { name: 'A Shield, Propped', found: 'A shield set against the wall, face out, the way you leave it when you are sitting down for a moment and not when you are done with it. The device on it has been scoured off, deliberately and badly.' },
    { name: 'A Blade Snapped at the Tang', found: 'A sword broken where swords do not usually break — not the blade, the tang, the part the hand holds. It failed at the hilt. Somebody trusted it right up until it did.' },
  ],
  scholar: [
    { name: 'A Satchel Gone to Pulp', found: 'A satchel of paper that has been wet and dried more than once. What is left is a brick. The strap is worn through on one side only, so it was carried on the same shoulder for years.' },
    { name: 'A Lens, Cracked Across', found: 'A ground lens in a brass ring, cracked corner to corner. Grinding one takes a season. Somebody carried it down here anyway, which tells you what they thought was worth looking at.' },
  ],
  monarch: [
    { name: 'A Signet, Too Large', found: 'A signet ring sized for a larger hand than the one that last wore it — it has been wrapped with thread to make it fit, several times, by several people.' },
    { name: 'A Decree, Unsealed', found: 'A folded order with the wax still soft-edged and unstamped. It was written, and read over, and never sealed, and the difference between those last two is the whole of somebody\'s last day.' },
  ],
  heretic: [
    { name: 'A Book with One Page Left', found: 'A book burnt to the spine with a single page unburnt in the middle of it, which fire does not do by accident and people do on purpose.' },
    { name: 'A Symbol Turned to the Wall', found: 'A holy sign hung deliberately backwards, facing the stone. Not smashed. Not thrown down. Turned around, and left hanging, which is a far more careful kind of anger.' },
  ],
  wanderer: [
    { name: 'A Map with No Marks on It', found: 'A map of somewhere else entirely, folded to a softness that takes years, with nothing written on it — no route, no cross, no destination. They were not navigating. They were just carrying it.' },
    { name: 'A Cup Cut for Two', found: 'A wooden cup with two notches on the rim, one worn deep and one barely started. Whoever cut the second notch did not get much use out of it.' },
  ],
};

/**
 * The thread that explains the leaving.
 *
 * This is the payoff of the whole feature and the reason it lives in the
 * engine rather than in a lore file: `mentorId`, `rivalId` and
 * `slainByBeastId` are REAL LINKS INTO THE SAME GENERATED HISTORY the
 * Chronicle screen shows. A player who reads "the thing that killed them has
 * not left this gate" can go and find that thing, and it will be there.
 *
 * Ordered strongest first and only one is used: three threads at once reads
 * as a database dump, and the strongest one is always the one where the other
 * end of the thread is standing in the same dungeon you are.
 */
function figureThread(figure: WorldFigure, world: GeneratedWorld, gateId: GateId): string | null {
  if (figure.slainByBeastId) {
    const beast: FamousBeast | undefined = world.beasts.find((b) => b.id === figure.slainByBeastId);
    if (beast) {
      return beast.gateId === gateId
        ? `It was ${beast.name}, ${beast.epithet}, that ended them. ${beast.name} is still here. It has not moved on, and neither, in every way that counts, have they.`
        : `It was ${beast.name}, ${beast.epithet}, that ended them — and that was at the ${GATES[beast.gateId].name}, not here. So they got this far afterwards, or somebody carried this for them.`;
    }
  }
  if (figure.rivalId) {
    const rival = world.figures.find((f) => f.id === figure.rivalId);
    if (rival) {
      return `They spent a good part of their life opposed to ${rival.name} ${rival.title}. The history keeps them on the same page for that and nothing else. Neither of them is in a position to object to the arrangement now.`;
    }
  }
  if (figure.mentorId) {
    const mentor = world.figures.find((f) => f.id === figure.mentorId);
    if (mentor) {
      return `${mentor.name} ${mentor.title} taught them. Everything they knew coming down here, they were given by somebody who is also dead, and the giving is still the last good thing in the record.`;
    }
  }
  return null;
}

/** Which of the dead could plausibly have left something in THIS gate. */
export function candidateFigures(world: GeneratedWorld): WorldFigure[] {
  return world.figures.filter((f) => f.diedYear !== null);
}

function figureLeaving(figure: WorldFigure, world: GeneratedWorld, gateId: GateId, pick: (n: number) => number): Leaving {
  const objects = FIGURE_OBJECTS[figure.role];
  const object = objects[pick(objects.length)];
  const who = `${figure.name} ${figure.title}`;
  const passage = [object.found];
  // The fate line verbatim, because it is what the Chronicle screen shows for
  // this person. Two places quoting the same sentence is what makes a
  // generated history feel like a record rather than a text generator.
  passage.push(`The realm remembers them. ${figure.fate}`);
  const thread = figureThread(figure, world, gateId);
  if (thread) passage.push(thread);
  return {
    kind: 'figure',
    name: object.name,
    author: who,
    passage,
    logLine: `${object.name} — left by ${who}.`,
  };
}

// -------------------------------------------------------------------------
// Your own dead
// -------------------------------------------------------------------------

/**
 * A previous telling of yours ended, and this is where.
 *
 * Deliberately the plainest writing in the file. Everything else here is the
 * game describing strangers to you; this one is the game describing you, and
 * the flourish it would take to dress that up is exactly what would spoil it.
 * The epitaph is not rewritten — it is the same sentence the Chronicler
 * committed to the book at the moment that run died, which is the only reason
 * the player has to believe any of this.
 */
function tellingLeaving(record: FallenTelling): Leaving {
  return {
    kind: 'telling',
    name: 'A Body in Familiar Colours',
    author: `${record.name}, the ${ordinal(record.telling)} telling`,
    passage: [
      `You know the shape of it before you are near enough to know the face. The kit is arranged the way you arrange yours. The straps are done up in your order.`,
      `${record.name}. Level ${record.level}. The book has this one: ${record.epitaph}`,
      `They got as far as ${record.place}, and then they got here, and the difference between those two facts is not written down anywhere and does not need to be.`,
    ],
    logLine: `You find ${record.name} of the ${ordinal(record.telling)} telling, and take back what they no longer need.`,
    tellingNumber: record.telling,
  };
}

// -------------------------------------------------------------------------
// Composition
// -------------------------------------------------------------------------

export interface LeavingContext {
  world: GeneratedWorld | null;
  gateId: GateId;
  /** Your own fallen runs, newest last, exactly as the book holds them. */
  fallen: FallenTelling[];
  /** Tellings already used by a leaving this expedition — no run repeats. */
  usedTellings: number[];
  /** 0..n-1, seeded by the caller. */
  pick: (n: number) => number;
}

/**
 * Choose whose leaving this is.
 *
 * The weighting is the argument the feature is making. Your own dead come
 * first when there are any unspent ones, because a player who has died and
 * then finds themselves is the single strongest thing this system can do and
 * it should never lose a coin flip to a nameless boot. Figures come next, and
 * only when the world actually generated somebody who died. The nameless are
 * the floor — always available, so this can never fail to produce something.
 */
export function composeLeaving(ctx: LeavingContext): Leaving {
  const unspent = ctx.fallen.filter((f) => !ctx.usedTellings.includes(f.telling));
  if (unspent.length && ctx.pick(100) < 45) {
    // Newest first: the run you remember best is the one worth meeting.
    return tellingLeaving(unspent[unspent.length - 1]);
  }
  const figures = ctx.world ? candidateFigures(ctx.world) : [];
  if (figures.length && ctx.pick(100) < 70) {
    return figureLeaving(figures[ctx.pick(figures.length)], ctx.world!, ctx.gateId, ctx.pick);
  }
  const n = NAMELESS[ctx.pick(NAMELESS.length)];
  return {
    kind: 'nameless',
    name: n.name,
    author: null,
    passage: [...n.passage],
    logLine: `${n.name}. Nobody wrote down who.`,
  };
}
