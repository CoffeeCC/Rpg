export function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * Deterministic PRNG (mulberry32) for world/history generation — the same
 * seed always builds the same world. Gameplay randomness stays on Math.random.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)];
  }

  /** Pick without replacement (mutates nothing; tracks used indices). */
  pickUnique<T>(list: readonly T[], used: Set<number>): T {
    if (used.size >= list.length) return this.pick(list);
    let idx = this.int(list.length);
    let guard = 0;
    while (used.has(idx) && guard++ < 200) idx = this.int(list.length);
    used.add(idx);
    return list[idx];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
