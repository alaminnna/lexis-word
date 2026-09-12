import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  supportsHaptics, vibrateCorrect, vibrateIncorrect, vibrateSample, vibrateTap,
} from './haptics';
import { answerFeedback, completeFeedback, uiTapFeedback } from './feedback';
import { useSettings } from '../store/settings';

function stubVibrate(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true, writable: true });
  return fn;
}

// Manual defineProperty stubs leak across tests (vi.restoreAllMocks does not
// cover them) — capture and restore the originals.
const ORIG_VIBRATE: unknown = (navigator as unknown as Record<string, unknown>).vibrate;
const ORIG_MATCH_MEDIA: unknown = (window as unknown as Record<string, unknown>).matchMedia;

function restoreGlobals(): void {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIG_VIBRATE === undefined) delete (navigator as unknown as Record<string, unknown>).vibrate;
  else Object.defineProperty(navigator, 'vibrate', { value: ORIG_VIBRATE, configurable: true, writable: true });
  if (ORIG_MATCH_MEDIA === undefined) delete (window as unknown as Record<string, unknown>).matchMedia;
  else Object.defineProperty(window, 'matchMedia', { value: ORIG_MATCH_MEDIA, configurable: true, writable: true });
}

describe('haptics', () => {
  afterEach(() => {
    restoreGlobals();
  });

  it('vibrates per-intensity patterns', () => {
    const v = stubVibrate();
    expect(supportsHaptics()).toBe(true);
    expect(vibrateCorrect('light')).toBe(true);
    expect(v).toHaveBeenLastCalledWith([15]);
    expect(vibrateIncorrect('medium')).toBe(true);
    expect(v).toHaveBeenLastCalledWith([35, 60, 35]);
    expect(vibrateTap('strong')).toBe(true);
    expect(v).toHaveBeenLastCalledWith([20]);
    expect(vibrateSample('medium')).toBe(true);
  });

  it('no-ops safely without vibrate support', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });
    expect(supportsHaptics()).toBe(false);
    expect(vibrateCorrect('medium')).toBe(false);
  });

  it('pauses under prefers-reduced-motion', () => {
    stubVibrate();
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: true }),
      configurable: true, writable: true,
    });
    expect(vibrateCorrect('medium')).toBe(false);
  });
});

describe('feedback orchestration', () => {
  beforeEach(() => {
    useSettings.getState().reset();
  });

  afterEach(() => {
    restoreGlobals();
    useSettings.getState().reset();
  });

  it('vibrates on answers per settings, never on taps', () => {
    const v = stubVibrate();
    useSettings.getState().updateHaptics({ enabled: true, intensity: 'light', onCorrect: true, onIncorrect: false });
    answerFeedback(true);
    expect(v).toHaveBeenLastCalledWith([15]);
    v.mockClear();
    answerFeedback(false);
    expect(v).not.toHaveBeenCalled();
    uiTapFeedback();
    expect(v).not.toHaveBeenCalled();
  });

  it('stays silent when haptics are disabled', () => {
    const v = stubVibrate();
    useSettings.getState().updateHaptics({ enabled: false });
    answerFeedback(true);
    completeFeedback();
    expect(v).not.toHaveBeenCalled();
  });
});
