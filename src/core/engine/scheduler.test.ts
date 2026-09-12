import { describe, expect, it } from 'vitest';
import { dueAfterLapse, dueAfterSuccess, nextIntervalDays } from './scheduler';
import { gradeTyped, isHesitation } from './grading';
import { DAY_MS } from '../../utils/time';

const NOW = 1_700_000_000_000;

describe('scheduler', () => {
  it('walks the interval ladder with strength scaling', () => {
    // streak 1, strength 16.5 → 2 × (0.5 + 16.5/200) = 1.165
    expect(nextIntervalDays(1, 16.5)).toBeCloseTo(1.165, 9);
    expect(nextIntervalDays(0, 0)).toBeCloseTo(0.5, 9); // 1 × 0.5
    expect(nextIntervalDays(6, 100)).toBeCloseTo(64, 9);
  });

  it('never exceeds the 90-day cap', () => {
    for (let streak = 0; streak <= 10; streak++) {
      for (const s of [0, 25, 50, 75, 100]) {
        expect(nextIntervalDays(streak, s)).toBeLessThanOrEqual(90);
      }
    }
  });

  it('lands successful in-session retries exactly +1 day out', () => {
    const r = dueAfterSuccess(NOW, 0, 5, true);
    expect(r.nextDueAt).toBe(NOW + DAY_MS);
    expect(r.intervalDays).toBe(1);
  });

  it('schedules lapses in 10 min (in session) or immediately (between sessions)', () => {
    expect(dueAfterLapse(NOW, true)).toBe(NOW + 10 * 60 * 1000);
    expect(dueAfterLapse(NOW, false)).toBe(NOW);
  });
});

describe('typed grading', () => {
  it('grades exact answers correct', () => {
    expect(gradeTyped('Achieve', 'achieve').outcome).toBe('correct');
    expect(gradeTyped('achieve', '  ACHIEVE ').outcome).toBe('correct');
  });

  it('allows distance ≤1 (≤2 for words ≥6 letters) as near-miss', () => {
    expect(gradeTyped('commission', 'comission').outcome).toBe('near-miss'); // 10 letters, d=1
    expect(gradeTyped('occur', 'ocur').outcome).toBe('near-miss'); // 5 letters, d=1
    expect(gradeTyped('analysis', 'analyss').outcome).toBe('near-miss'); // 8 letters, d=1
  });

  it('marks larger deviations wrong', () => {
    expect(gradeTyped('commission', 'comixon').outcome).toBe('wrong'); // d=3 > 2
    expect(gradeTyped('aid', 'ax').outcome).toBe('wrong');
    expect(gradeTyped('achieve', 'obtain').outcome).toBe('wrong');
  });

  it('uses threshold 2 only for long words', () => {
    // 'aid' (3 letters): distance 1 → near-miss; distance 2 → wrong
    expect(gradeTyped('aid', 'ad').outcome).toBe('near-miss');
    expect(gradeTyped('aid', 'ax').outcome).toBe('wrong');
  });
});

describe('hesitation', () => {
  it('flags responses slower than 2× expected', () => {
    expect(isHesitation('mcq-word-meaning', 12_001)).toBe(true);
    expect(isHesitation('mcq-word-meaning', 12_000)).toBe(false);
    expect(isHesitation('sentence-production', 60_000)).toBe(false);
  });
});
