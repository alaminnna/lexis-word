// One orchestrator for answer/UI/complete feedback: reads Settings once per
// call, plays the enabled channels (sound and/or haptics). Call sites stay
// one-liners; all gating lives here.

import { useSettings } from '../store/settings';
import { playComplete, playCorrect, playIncorrect, playTap } from './sound';
import { vibrateCorrect, vibrateIncorrect } from './haptics';

/** Correct/incorrect answer moment: session runner, labs, writing grading. */
export function answerFeedback(correct: boolean): void {
  const s = useSettings.getState();
  if (correct) {
    if (s.sound.enabled && s.sound.playCorrect) playCorrect(s.sound.theme, s.sound.volume);
    if (s.haptics.enabled && s.haptics.onCorrect) vibrateCorrect(s.haptics.intensity);
  } else {
    if (s.sound.enabled && s.sound.playIncorrect) playIncorrect(s.sound.theme, s.sound.volume);
    if (s.haptics.enabled && s.haptics.onIncorrect) vibrateIncorrect(s.haptics.intensity);
  }
}

/** Subtle tap for generic buttons (default off — opt-in in Settings). */
export function uiTapFeedback(): void {
  const s = useSettings.getState();
  if (s.sound.enabled && s.sound.playUiTap) playTap(s.sound.theme, s.sound.volume);
  // Taps never vibrate: vibration is reserved for answer moments.
}

/** Session-complete flourish (single call site guards repeats). */
export function completeFeedback(): void {
  const s = useSettings.getState();
  if (s.sound.enabled && s.sound.playComplete) playComplete(s.sound.theme, s.sound.volume);
  if (s.haptics.enabled && s.haptics.onCorrect) vibrateCorrect(s.haptics.intensity);
}

/** Settings preview: correct motif then incorrect motif. */
export function previewFeedback(): void {
  const s = useSettings.getState();
  if (!s.sound.enabled) return;
  playCorrect(s.sound.theme, s.sound.volume);
  window.setTimeout(() => {
    const live = useSettings.getState();
    if (live.sound.enabled) playIncorrect(live.sound.theme, live.sound.volume);
  }, 450);
}
