import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { isSoundSupported, playComplete, playCorrect, playIncorrect, playTap, resetSoundEngine } from './sound';

class FakeOsc {
  type: OscillatorType = 'sine';
  frequency = { value: 0 };
  startedAt: number | null = null;
  connect(): void { }
  start(t?: number): void {
    this.startedAt = t ?? 0;
  }
  stop(): void { }
}

class FakeGain {
  peaks: number[] = [];
  gain = {
    value: 0,
    setValueAtTime: (): void => undefined,
    exponentialRampToValueAtTime: (v: number): void => {
      this.peaks.push(v);
    },
  };
  connect(): void { }
}

class FakeCtx {
  static created: FakeCtx[] = [];
  oscs: FakeOsc[] = [];
  gains: FakeGain[] = [];
  currentTime = 100;
  destination = {};
  constructor() {
    FakeCtx.created.push(this);
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

/** The context instance the service actually used (it constructs its own). */
function usedCtx(): FakeCtx {
  const all = FakeCtx.created;
  if (all.length === 0) throw new Error('service created no AudioContext');
  return all[all.length - 1]!;
}

let fake: FakeCtx | null = null;

describe('feedback sounds', () => {
  beforeEach(() => {
    resetSoundEngine();
    FakeCtx.created = [];
    fake = new FakeCtx();
    vi.stubGlobal('AudioContext', FakeCtx);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSoundEngine();
    fake = null;
  });

  it('plays the calm chime motif for correct answers', () => {
    expect(playCorrect('chime', 0.6)).toBe(true);
    const oscs = usedCtx().oscs;
    expect(oscs).toHaveLength(2);
    expect(oscs.map((o) => o.frequency.value)).toEqual([523.25, 783.99]);
    expect(oscs.every((o) => o.startedAt !== null)).toBe(true);
  });

  it('scales gain with volume', () => {
    expect(playCorrect('pulse', 0.5)).toBe(true);
    const c = usedCtx();
    expect(c.oscs).toHaveLength(1);
    expect(c.oscs[0]!.type).toBe('triangle');
    // pulse correct = single tone at gain 0.7 → peak ≈ volume × 0.7
    const peaks = c.gains.flatMap((g) => g.peaks);
    expect(Math.max(...peaks)).toBeCloseTo(0.35, 9);
  });

  it('plays incorrect + complete + tap motifs', () => {
    expect(playIncorrect('chime', 0.6)).toBe(true);
    expect(playComplete('chime', 0.6)).toBe(true);
    expect(playTap('chime', 0.6)).toBe(true);
  });

  it('stays silent at zero volume', () => {
    expect(playCorrect('chime', 0)).toBe(false);
    expect(fake!.oscs).toHaveLength(0);
  });

  it('no-ops safely without AudioContext', () => {
    resetSoundEngine();
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true, writable: true });
    delete (window as unknown as Record<string, unknown>).webkitAudioContext;
    expect(isSoundSupported()).toBe(false);
    expect(playCorrect('chime', 0.6)).toBe(false);
    expect(playIncorrect('chime', 0.6)).toBe(false);
  });
});
