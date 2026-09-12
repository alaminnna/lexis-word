// Persistence wiring (§20): hydrate on boot, debounced saves (500ms),
// forced flush on visibilitychange/beforeunload, quota triage + notice.

import { useProgress, progressSnapshot } from './progress';
import { useSettings, settingsSnapshot } from './settings';
import { useSessionPersist } from './session';
import { persistence, triageQuota, resetQuotaFlag } from '../services/persistence';

const DEBOUNCE_MS = 500;

let progressTimer: ReturnType<typeof setTimeout> | null = null;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function flushProgress(): void {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  persistence.saveProgress(progressSnapshot());
}

function flushSettings(): void {
  if (settingsTimer) {
    clearTimeout(settingsTimer);
    settingsTimer = null;
  }
  persistence.saveSettings(settingsSnapshot());
}

export function flushAll(): void {
  flushProgress();
  flushSettings();
}

function scheduleProgress(): void {
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(flushProgress, DEBOUNCE_MS);
}

function scheduleSettings(): void {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(flushSettings, DEBOUNCE_MS);
}

/** Synchronous hydration from localStorage. MUST run before the first render —
 *  the onboarding gate reads real state at first paint (calling it in a layout
 *  effect was too late: /onboarding never mounts the layout, so hydration
 *  never ran and every refresh bounced back to onboarding). */
export function hydrateStores(): void {
  useSettings.getState().hydrate();
  const loaded = persistence.loadProgress();
  useProgress.getState().hydrate(loaded);
  useSessionPersist.getState().hydrate();
}

/** Boot once from App: hydrate stores, start subscriptions + flush hooks. */
export function startPersistence(): void {
  if (started) return;
  started = true;

  hydrateStores();

  useProgress.subscribe(scheduleProgress);
  useSettings.subscribe(scheduleSettings);

  const flush = (): void => flushAll();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', flush);

  window.addEventListener('lexis:quota', () => {
    void (async () => {
      const snap = progressSnapshot();
      const { progress: next, action } = await triageQuota(snap);
      if (action !== 'unresolved') {
        useProgress.getState().replaceAll(next);
        flushProgress();
      }
      window.dispatchEvent(new CustomEvent('lexis:quota-notice', { detail: { action } }));
      resetQuotaFlag();
    })();
  });
}
