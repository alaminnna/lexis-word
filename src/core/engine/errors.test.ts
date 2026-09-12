import { describe, expect, it } from 'vitest';
import { aggregateErrorProfile, classifySpellingError } from './errors';

describe('spelling error classification', () => {
  it('detects dropped double letters', () => {
    expect(classifySpellingError('commission', 'comission')).toBe('dropped-double');
    expect(classifySpellingError('occur', 'ocur')).toBe('dropped-double');
  });

  it('detects vowel substitutions', () => {
    expect(classifySpellingError('separate', 'seperate')).toBe('vowel-substitution');
    expect(classifySpellingError('definite', 'definate')).toBe('vowel-substitution');
  });

  it('detects adjacent transpositions', () => {
    expect(classifySpellingError('achieve', 'ahcieve')).toBe('transposition');
    expect(classifySpellingError('from', 'form')).toBe('transposition');
  });

  it('detects truncations', () => {
    expect(classifySpellingError('necessary', 'necess')).toBe('truncation');
  });

  it('detects suffix / inflection errors', () => {
    expect(classifySpellingError('achieved', 'achive')).toBe('suffix');
    expect(classifySpellingError('studies', 'study')).toBe('suffix');
  });

  it('detects silent-letter omissions', () => {
    expect(classifySpellingError('knowledge', 'nowledge')).toBe('silent-letter');
    expect(classifySpellingError('psychology', 'sychology')).toBe('silent-letter');
  });

  it('falls back to other for unclassifiable slips', () => {
    expect(classifySpellingError('achieve', 'zxq')).toBe('other');
    expect(classifySpellingError('achieve', 'achieve')).toBe('other');
  });
});

describe('learner error aggregation', () => {
  it('ranks patterns by total count with affected words', () => {
    const agg = aggregateErrorProfile({
      commission: { 'dropped-double': 3 },
      occur: { 'dropped-double': 1, 'vowel-substitution': 2 },
    });
    expect(agg[0]).toMatchObject({ kind: 'dropped-double', count: 4 });
    expect(agg[0]!.words).toEqual(expect.arrayContaining(['commission', 'occur']));
    expect(agg[1]).toMatchObject({ kind: 'vowel-substitution', count: 2 });
  });
});
