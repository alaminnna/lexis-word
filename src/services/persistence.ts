// PersistenceService (§18, §20): versioned localStorage for progress + settings,
// IndexedDB for the dictionary cache and event log, JSON export/import with
// validation + migrate() hook, quota-error triage (cache → old events → notify).

import type { PersistedProgress, UserSettings, WordProgress } from '../types/domain';
import { DIMENSIONS } from '../types/domain';
import { freshWordProgress } from '../core/engine/mastery';
import { idb } from './idb';

export const PROGRESS_KEY = 'lexis:progress:v1';
export const SETTINGS_KEY = 'lexis:settings:v1';
const PROGRESS_VERSION = 1;

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: '',
  dailyNewTarget: 8,
  maxActiveWords: 90,
  sessionLengthTarget: 15,
  bengaliPolicy: 'on-demand',
  speechRate: 1,
  theme: 'light',
  seed: 20260911,
  sound: {
    enabled: true, volume: 0.6, theme: 'chime',
    playCorrect: true, playIncorrect: true, playUiTap: false, playComplete: true,
  },
  haptics: { enabled: true, intensity: 'medium', onCorrect: true, onIncorrect: true },
};

export function emptyProgress(): PersistedProgress {
  return {
    version: PROGRESS_VERSION,
    words: {},
    confusion: [],
    daily: {},
    events: [],
    introducedToday: { date: '', wordIds: [] },
    onboardingDone: false,
    firstExposure: {},
  };
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

const NUM = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Normalize one stored WordProgress to the current schema. Older versions of
 * the app wrote dimension states without `recent` (or partial dimensions) —
 * feeding those to the engine crashes the session builder, which disabled the
 * Today CTA and dead-ended /learn. Loading and importing both pass through here.
 */
function normalizeWordProgress(raw: unknown, wordId: string): WordProgress {
  const base = freshWordProgress(wordId, Date.now());
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const dimsRaw = typeof r.dimensions === 'object' && r.dimensions !== null
    ? (r.dimensions as Record<string, unknown>)
    : {};
  const dimensions = { ...base.dimensions };
  for (const d of DIMENSIONS) {
    const s = dimsRaw[d];
    if (typeof s !== 'object' || s === null) continue;
    const st = s as Record<string, unknown>;
    dimensions[d] = {
      strength: Math.min(100, Math.max(0, NUM(st.strength))),
      streak: Math.max(0, NUM(st.streak)),
      lapses: Math.max(0, NUM(st.lapses)),
      attempts: Math.max(0, NUM(st.attempts)),
      successes: Math.max(0, NUM(st.successes)),
      lastReviewedAt: NUM(st.lastReviewedAt),
      nextDueAt: NUM(st.nextDueAt),
      lastIntervalDays: Math.max(0, NUM(st.lastIntervalDays)),
      recent: Array.isArray(st.recent)
        ? st.recent.filter((b): b is boolean => typeof b === 'boolean').slice(-2)
        : [],
    };
  }
  const stage = NUM(r.masteryStage);
  const firstExposure = typeof r.firstExposureModality === 'string'
    ? (r.firstExposureModality as WordProgress['firstExposureModality'])
    : null;
  const errorProfile: Record<string, number> = {};
  if (typeof r.errorProfile === 'object' && r.errorProfile !== null) {
    for (const [k, v] of Object.entries(r.errorProfile as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) errorProfile[k] = v;
    }
  }
  return {
    wordId,
    introducedAt: NUM(r.introducedAt),
    masteryStage: (Math.min(5, Math.max(0, Math.round(stage))) as WordProgress['masteryStage']),
    dimensions,
    firstExposureModality: firstExposure,
    errorProfile,
    updatedAt: NUM(r.updatedAt),
  };
}

/** Validate + migrate imported progress to the current schema. Throws on invalid. */
export function migrateProgress(data: unknown): PersistedProgress {
  if (typeof data !== 'object' || data === null) throw new Error('Import is not an object.');
  const d = data as Record<string, unknown>;
  if (d.version !== PROGRESS_VERSION) {
    throw new Error(`Unsupported progress version (${String(d.version)}). Expected ${PROGRESS_VERSION}.`);
  }
  if (typeof d.words !== 'object' || d.words === null) throw new Error('Import is missing word progress.');
  const base = emptyProgress();
  const merged: PersistedProgress = {
    ...base,
    ...(d as Partial<PersistedProgress>),
    version: PROGRESS_VERSION,
  };
  // Normalize every word to the current schema (stale stores crash the engine).
  const words: Record<string, WordProgress> = {};
  for (const [id, raw] of Object.entries(d.words as Record<string, unknown>)) {
    words[id] = normalizeWordProgress(raw, id);
  }
  merged.words = words;
  // Validate the raw import fields (corrupt files must not poison the store).
  if (!Array.isArray(d.events)) merged.events = [];
  if (!Array.isArray(d.confusion)) merged.confusion = [];
  if (typeof d.daily !== 'object' || d.daily === null) merged.daily = {};
  return merged;
}

function validateSettings(data: unknown): UserSettings {
  if (typeof data !== 'object' || data === null) throw new Error('Settings import is not an object.');
  const d = data as Record<string, unknown>;
  const s: UserSettings = { ...DEFAULT_SETTINGS };
  if (typeof d.displayName === 'string') s.displayName = d.displayName.trim().slice(0, 40);
  if (typeof d.dailyNewTarget === 'number') s.dailyNewTarget = Math.min(15, Math.max(4, Math.round(d.dailyNewTarget)));
  if (typeof d.maxActiveWords === 'number') s.maxActiveWords = Math.min(200, Math.max(20, Math.round(d.maxActiveWords)));
  if (typeof d.sessionLengthTarget === 'number') {
    s.sessionLengthTarget = Math.min(25, Math.max(10, Math.round(d.sessionLengthTarget)));
  }
  if (d.bengaliPolicy === 'always' || d.bengaliPolicy === 'on-demand' || d.bengaliPolicy === 'fade') {
    s.bengaliPolicy = d.bengaliPolicy;
  }
  if (typeof d.preferredVoiceURI === 'string') s.preferredVoiceURI = d.preferredVoiceURI;
  if (d.speechRate === 0.75 || d.speechRate === 0.9 || d.speechRate === 1) s.speechRate = d.speechRate;
  if (d.theme === 'light' || d.theme === 'dark') s.theme = d.theme;
  if (typeof d.seed === 'number' && Number.isFinite(d.seed)) s.seed = Math.floor(d.seed);
  // Nested feedback settings: merge field-by-field so older stores keep working.
  if (typeof d.sound === 'object' && d.sound !== null) {
    const snd = d.sound as Record<string, unknown>;
    const t = s.sound;
    if (typeof snd.enabled === 'boolean') t.enabled = snd.enabled;
    if (typeof snd.volume === 'number' && Number.isFinite(snd.volume)) {
      t.volume = Math.min(1, Math.max(0, snd.volume));
    }
    if (snd.theme === 'chime' || snd.theme === 'pulse') t.theme = snd.theme;
    if (typeof snd.playCorrect === 'boolean') t.playCorrect = snd.playCorrect;
    if (typeof snd.playIncorrect === 'boolean') t.playIncorrect = snd.playIncorrect;
    if (typeof snd.playUiTap === 'boolean') t.playUiTap = snd.playUiTap;
    if (typeof snd.playComplete === 'boolean') t.playComplete = snd.playComplete;
  }
  if (typeof d.haptics === 'object' && d.haptics !== null) {
    const hap = d.haptics as Record<string, unknown>;
    const h = s.haptics;
    if (typeof hap.enabled === 'boolean') h.enabled = hap.enabled;
    if (hap.intensity === 'light' || hap.intensity === 'medium' || hap.intensity === 'strong') {
      h.intensity = hap.intensity;
    }
    if (typeof hap.onCorrect === 'boolean') h.onCorrect = hap.onCorrect;
    if (typeof hap.onIncorrect === 'boolean') h.onIncorrect = hap.onIncorrect;
  }
  return s;
}

export interface ExportBundle {
  app: 'lexis';
  exportedAt: number;
  progress: PersistedProgress;
  settings: UserSettings;
}

export const persistence: PersistenceService = {
  loadProgress() {
    const raw = readJson(PROGRESS_KEY);
    if (!raw) return null;
    try {
      return migrateProgress(raw);
    } catch {
      return null;
    }
  },

  saveProgress(state) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
    } catch (err) {
      handleQuotaError(err);
    }
  },

  loadSettings() {
    const raw = readJson(SETTINGS_KEY);
    if (!raw) return null;
    try {
      return validateSettings(raw);
    } catch {
      return null;
    }
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      handleQuotaError(err);
    }
  },

  exportAll(progress, settings) {
    const bundle: ExportBundle = { app: 'lexis', exportedAt: Date.now(), progress, settings };
    return JSON.stringify(bundle);
  },

  importAll(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new Error('File is not valid JSON.');
    }
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Import bundle is not an object.');
    const b = parsed as Record<string, unknown>;
    if (b.app !== 'lexis') throw new Error('Not a Lexis export file.');
    return { progress: migrateProgress(b.progress), settings: validateSettings(b.settings) };
  },

  resetAll() {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    void idb.clear('dict').catch(() => undefined);
    void idb.clear('events').catch(() => undefined);
  },
};

export interface PersistenceService {
  loadProgress(): PersistedProgress | null;
  saveProgress(state: PersistedProgress): void;
  loadSettings(): UserSettings | null;
  saveSettings(settings: UserSettings): void;
  exportAll(progress: PersistedProgress, settings: UserSettings): string;
  importAll(json: string): { progress: PersistedProgress; settings: UserSettings };
  resetAll(): void;
}

export type QuotaAction = 'cache-pruned' | 'events-compacted' | 'unresolved';

/**
 * Quota triage (§20, §22): prune the dictionary cache first, then compact
 * events older than 30 days (daily aggregates are already recorded live),
 * then report unresolved so the UI can notify — never silently drop progress.
 */
export async function triageQuota(progress: PersistedProgress): Promise<{ progress: PersistedProgress; action: QuotaAction }> {
  try {
    await idb.clear('dict');
    return { progress, action: 'cache-pruned' };
  } catch {
    // fall through to event compaction
  }
  const cutoff = Date.now() - 30 * 86_400_000;
  const kept = progress.events.filter((e) => e.timestamp >= cutoff);
  if (kept.length < progress.events.length) {
    return { progress: { ...progress, events: kept }, action: 'events-compacted' };
  }
  return { progress, action: 'unresolved' };
}

let quotaNotified = false;
export function handleQuotaError(_err: unknown): void {
  // localStorage quota: the store's subscriber escalates via triageQuota and
  // surfaces a notice. This guard prevents notification storms.
  if (quotaNotified) return;
  quotaNotified = true;
  window.dispatchEvent(new CustomEvent('lexis:quota'));
}

export function resetQuotaFlag(): void {
  quotaNotified = false;
}
