import { describe, expect, it } from 'vitest';
import {
  applyConfusionSignal, drillableEdges, findNearMissWord, pairKey, recordDiscrimination,
} from './confusion';

const NOW = 1_700_000_000_000;

describe('confusion graph', () => {
  it('creates edges from wrong-choice and near-miss signals', () => {
    const e1 = applyConfusionSignal([], 'affect', 'effect', 'wrong-choice', NOW);
    expect(e1).toHaveLength(1);
    expect(e1[0]).toMatchObject({ a: 'affect', b: 'effect', weight: 1 });
    expect(pairKey('effect', 'affect')).toBe('affect::effect');
    const e2 = applyConfusionSignal(e1, 'affect', 'effect', 'near-miss', NOW + 1);
    expect(e2[0]!.weight).toBe(2);
  });

  it('adds half weight for hesitation errors', () => {
    const e = applyConfusionSignal([], 'a', 'b', 'hesitation', NOW);
    expect(e[0]!.weight).toBe(0.5);
  });

  it('activates the weak prior only together with a real event', () => {
    const e = applyConfusionSignal([], 'a', 'b', 'wrong-choice', NOW, true);
    expect(e[0]!.weight).toBe(1.25);
  });

  it('schedules drills at weight ≥ 2', () => {
    const edges = applyConfusionSignal(
      applyConfusionSignal([], 'a', 'b', 'wrong-choice', NOW), 'a', 'b', 'wrong-choice', NOW,
    );
    expect(drillableEdges(edges)).toHaveLength(1);
    expect(drillableEdges(applyConfusionSignal([], 'a', 'b', 'wrong-choice', NOW))).toHaveLength(0);
  });

  it('halves the edge after three consecutive correct discriminations', () => {
    let edges = applyConfusionSignal(
      applyConfusionSignal([], 'a', 'b', 'wrong-choice', NOW), 'a', 'b', 'wrong-choice', NOW,
    );
    edges = recordDiscrimination(edges, 'a', 'b', true, NOW);
    edges = recordDiscrimination(edges, 'a', 'b', true, NOW);
    expect(edges[0]!.weight).toBe(2);
    edges = recordDiscrimination(edges, 'a', 'b', true, NOW);
    expect(edges[0]!.weight).toBe(1);
    expect(edges[0]!.resolvedStreak).toBe(0);
  });

  it('resets the resolution streak on a miss without dropping weight', () => {
    let edges = applyConfusionSignal(
      applyConfusionSignal([], 'a', 'b', 'wrong-choice', NOW), 'a', 'b', 'wrong-choice', NOW,
    );
    edges = recordDiscrimination(edges, 'a', 'b', true, NOW);
    edges = recordDiscrimination(edges, 'a', 'b', false, NOW);
    expect(edges[0]!.resolvedStreak).toBe(0);
    expect(edges[0]!.weight).toBe(2);
  });

  it('finds near-miss confusions against other known words', () => {
    const vocab = [
      { id: 'affect', word: 'affect' },
      { id: 'effect', word: 'effect' },
      { id: 'achieve', word: 'achieve' },
    ];
    expect(findNearMissWord('effect', 'affect', vocab)).toBe('effect');
    expect(findNearMissWord('affection', 'affect', vocab)).toBeNull();
    expect(findNearMissWord('xyz', 'affect', vocab)).toBeNull();
  });
});
