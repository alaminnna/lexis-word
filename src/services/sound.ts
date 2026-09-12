// Calm feedback sounds (§16: no coin/NFT-game noise — soft synth tones only).
// Everything is synthesized with the Web Audio API: no audio files, works
// offline on phone and PC. All entry points are no-op safe (unsupported
// browsers, disabled settings) and return whether anything played.

import type { SoundSettings } from '../types/domain';

export type SoundTheme = SoundSettings['theme'];

interface ToneOpts {
  freq: number;
  /** seconds from now */
  at?: number;
  /** seconds */
  dur?: number;
  type?: OscillatorType;
  /** 0..1 multiplier on top of master volume */
  gain?: number;
}

type CtxLike = {
  currentTime: number;
  destination: unknown;
  createOscillator: () => {
    type: OscillatorType;
    frequency: { value: number };
    connect: (node: unknown) => void;
    start: (t?: number) => void;
    stop: (t?: number) => void;
  };
  createGain: () => {
    gain: { value: number; setValueAtTime: (v: number, t: number) => void; exponentialRampToValueAtTime: (v: number, t: number) => void };
    connect: (node: unknown) => void;
  };
  resume: () => Promise<void>;
};

let ctx: CtxLike | null = null;

function audioCtor(): (new () => CtxLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.AudioContext ?? w.webkitAudioContext) as (new () => CtxLike) | undefined;
  return typeof Ctor === 'function' ? Ctor : null;
}

export function isSoundSupported(): boolean {
  return audioCtor() !== null;
}

function ensureCtx(): CtxLike | null {
  if (ctx) {
    void ctx.resume().catch(() => undefined);
    return ctx;
  }
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: CtxLike, volume: number, opts: ToneOpts): void {
  const { freq, at = 0, dur = 0.35, type = 'sine', gain = 1 } = opts;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Gentle attack, exponential decay — no clicks, no harsh edges.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * gain), t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0002, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Calm pentatonic-ish voices. Chime = two-note motifs; pulse = single soft blips.
const VOICES: Record<SoundTheme, { correct: ToneOpts[]; incorrect: ToneOpts[]; complete: ToneOpts[]; tap: ToneOpts }> = {
  chime: {
    correct: [
      { freq: 523.25, dur: 0.4, gain: 0.9 },           // C5
      { freq: 783.99, at: 0.09, dur: 0.55, gain: 0.8 }, // G5
    ],
    incorrect: [
      { freq: 329.63, dur: 0.4, gain: 0.6 },           // E4
      { freq: 261.63, at: 0.12, dur: 0.5, gain: 0.55 }, // C4 — down, never harsh
    ],
    complete: [
      { freq: 523.25, dur: 0.35, gain: 0.8 },
      { freq: 659.25, at: 0.1, dur: 0.35, gain: 0.8 },  // E5
      { freq: 783.99, at: 0.2, dur: 0.6, gain: 0.85 },  // G5
    ],
    tap: { freq: 880, dur: 0.06, gain: 0.18 },
  },
  pulse: {
    correct: [{ freq: 660, dur: 0.12, type: 'triangle', gain: 0.7 }],
    incorrect: [{ freq: 196, dur: 0.22, gain: 0.6 }],
    complete: [
      { freq: 660, dur: 0.12, type: 'triangle', gain: 0.7 },
      { freq: 660, at: 0.14, dur: 0.2, type: 'triangle', gain: 0.7 },
    ],
    tap: { freq: 1200, dur: 0.04, gain: 0.15 },
  },
};

function play(theme: SoundTheme, volume: number, kind: 'correct' | 'incorrect' | 'complete' | 'tap'): boolean {
  if (volume <= 0) return false;
  const c = ensureCtx();
  if (!c) return false;
  try {
    const voice = VOICES[theme][kind];
    const tones = Array.isArray(voice) ? voice : [voice];
    for (const t of tones) tone(c, volume, t);
    return true;
  } catch {
    return false;
  }
}

export function playCorrect(theme: SoundTheme, volume: number): boolean {
  return play(theme, volume, 'correct');
}

export function playIncorrect(theme: SoundTheme, volume: number): boolean {
  return play(theme, volume, 'incorrect');
}

export function playComplete(theme: SoundTheme, volume: number): boolean {
  return play(theme, volume, 'complete');
}

export function playTap(theme: SoundTheme, volume: number): boolean {
  return play(theme, volume, 'tap');
}

/** Test hook: drop the cached context (fresh ensureCtx next call). */
export function resetSoundEngine(): void {
  ctx = null;
}
