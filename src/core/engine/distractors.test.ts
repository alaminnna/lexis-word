import { describe, expect, it } from 'vitest';
import { buildOptions, makePool, optionText } from './distractors';
import { WORDS } from '../../data/words';
import { mulberry32 } from '../../utils/rng';

const pool = makePool(WORDS);
const target = WORDS[0]!; // achieve

describe('distractor selection', () => {
  it('is deterministic for the same seed', () => {
    const a = buildOptions(target, pool, { count: 4, confusionPartners: [], mode: 'meaning', rand: mulberry32(7) });
    const b = buildOptions(target, pool, { count: 4, confusionPartners: [], mode: 'meaning', rand: mulberry32(7) });
    expect(a).toEqual(b);
  });

  it('always includes the answer exactly once, at the requested count', () => {
    for (const count of [3, 4, 5]) {
      const options = buildOptions(target, pool, { count, confusionPartners: [], mode: 'meaning', rand: mulberry32(count) });
      expect(options).toHaveLength(count);
      expect(options.filter((o) => o === optionText(target, 'meaning'))).toHaveLength(1);
      expect(new Set(options).size).toBe(count);
    }
  });

  it('prefers registered confusion partners', () => {
    const partner = WORDS.find((w) => w.id !== target.id)!;
    const options = buildOptions(target, pool, {
      count: 3, confusionPartners: [partner.id], mode: 'word', rand: mulberry32(1),
    });
    expect(options).toContain(partner.word);
  });

  it('never duplicates a meaning among options', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const options = buildOptions(target, pool, { count: 5, confusionPartners: [], mode: 'meaning', rand: mulberry32(seed) });
      expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(options.length);
    }
  });
});
