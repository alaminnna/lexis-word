// Haptic feedback (phone vibration). Android/Chrome support navigator.vibrate;
// iOS Safari does not — everything here feature-detects and no-ops safely.
// Haptics pause automatically under prefers-reduced-motion.

import type { HapticsSettings } from '../types/domain';

export type HapticIntensity = HapticsSettings['intensity'];

export function supportsHaptics(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const PATTERNS: Record<HapticIntensity, { tap: number[]; correct: number[]; incorrect: number[]; sample: number[] }> = {
  light: { tap: [8], correct: [15], incorrect: [25], sample: [15, 80, 25] },
  medium: { tap: [12], correct: [25], incorrect: [35, 60, 35], sample: [25, 80, 35, 80, 35] },
  strong: { tap: [20], correct: [40], incorrect: [60, 60, 60], sample: [40, 80, 60, 80, 60] },
};

function buzz(pattern: number[]): boolean {
  if (!supportsHaptics() || reducedMotion()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function vibrateCorrect(intensity: HapticIntensity): boolean {
  return buzz(PATTERNS[intensity].correct);
}

export function vibrateIncorrect(intensity: HapticIntensity): boolean {
  return buzz(PATTERNS[intensity].incorrect);
}

export function vibrateTap(intensity: HapticIntensity): boolean {
  return buzz(PATTERNS[intensity].tap);
}

/** One combined demo buzz for the Settings preview. */
export function vibrateSample(intensity: HapticIntensity): boolean {
  return buzz(PATTERNS[intensity].sample);
}
