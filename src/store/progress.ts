// Progress slice: the learner's memory model. One-way data flow (§18):
// UI dispatch → store action → pure engine fn (state, event, now) → newState.
// Persistence subscribes separately (store/persist.ts), never inside actions.

import { create } from 'zustand';
import type {
  ActivityType, DailyLog, LearningEvent, PersistedProgress,
} from '../types/domain';
import { applyLearningEvent, freshWordProgress, seedIntroduction, type ApplyOptions } from '../core/engine/mastery';
import { applyConfusionSignal, recordDiscrimination, type ConfusionSignal } from '../core/engine/confusion';
import { emptyProgress } from '../services/persistence';
import { dayKey } from '../utils/time';
import { uid } from '../utils/id';

const MAX_EVENTS = 10_000; // rolling log; daily aggregates are recorded live, so FIFO trim is compaction, not loss

interface ProgressActions {
  hydrate: (loaded: PersistedProgress | null) => void;
  meetWord: (wordId: string, modality: ActivityType, now: number) => void;
  commitEvent: (event: Omit<LearningEvent, 'id'>, opts?: ApplyOptions) => void;
  commitEvents: (events: Omit<LearningEvent, 'id'>[], opts?: ApplyOptions) => void;
  recordSpellingError: (wordId: string, kind: string, now: number) => void;
  addConfusionSignal: (a: string, b: string, signal: ConfusionSignal, now: number, prior?: boolean) => void;
  resolveConfusion: (a: string, b: string, correct: boolean, now: number) => void;
  addActiveMinutes: (date: string, minutes: number) => void;
  setOnboardingDone: () => void;
  replaceAll: (progress: PersistedProgress) => void;
  resetProgress: () => void;
}

export type ProgressState = PersistedProgress & ProgressActions & {
  /** True once persisted state has been loaded (guards route decisions on boot). */
  hydrated: boolean;
};

function rollIntroducedToday(state: PersistedProgress, now: number): PersistedProgress {
  const today = dayKey(now);
  if (state.introducedToday.date === today) return state;
  return { ...state, introducedToday: { date: today, wordIds: [] } };
}

function bumpDaily(state: PersistedProgress, event: LearningEvent): Record<string, DailyLog> {
  const date = dayKey(event.timestamp);
  const prev: DailyLog = state.daily[date] ?? {
    date, newWordsIntroduced: 0, itemsAnswered: 0, itemsCorrect: 0,
    activeMinutes: 0, dimensionsTrained: {},
  };
  const dimensionsTrained = { ...prev.dimensionsTrained };
  dimensionsTrained[event.dimension] = (dimensionsTrained[event.dimension] ?? 0) + 1;
  return {
    ...state.daily,
    [date]: {
      ...prev,
      itemsAnswered: prev.itemsAnswered + 1,
      itemsCorrect: prev.itemsCorrect + (event.correct ? 1 : 0),
      dimensionsTrained,
    },
  };
}

function applyEventToState(
  state: PersistedProgress,
  raw: Omit<LearningEvent, 'id'>,
  opts: ApplyOptions = {},
): PersistedProgress {
  const event: LearningEvent = { ...raw, id: uid('ev') };
  const existing = state.words[event.wordId] ?? freshWordProgress(event.wordId, event.timestamp);
  const updated = applyLearningEvent(existing, {
    activity: event.activity,
    dimension: event.dimension,
    correct: event.correct,
    responseMs: event.responseMs,
    confidence: event.confidence,
    hintsUsed: event.hintsUsed,
    timestamp: event.timestamp,
    aiVerified: event.detail?.aiVerified ?? false,
  }, opts);
  const events = [...state.events, event];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return {
    ...state,
    words: { ...state.words, [event.wordId]: updated },
    daily: bumpDaily(state, event),
    events,
  };
}

export const useProgress = create<ProgressState>()((set) => ({
  ...emptyProgress(),
  hydrated: false,

  hydrate: (loaded) => set(() => ({ ...(loaded ?? emptyProgress()), hydrated: true })),

  meetWord: (wordId, modality, now) =>
    set((state) => {
      const rolled = rollIntroducedToday(state, now);
      const existing = rolled.words[wordId] ?? freshWordProgress(wordId, now);
      const seeded = seedIntroduction(existing, modality, now);
      const alreadyIntroduced = existing.introducedAt > 0;
      const introducedToday = alreadyIntroduced || rolled.introducedToday.wordIds.includes(wordId)
        ? rolled.introducedToday
        : { ...rolled.introducedToday, wordIds: [...rolled.introducedToday.wordIds, wordId] };
      const today = dayKey(now);
      const prevDaily: DailyLog = rolled.daily[today] ?? {
        date: today, newWordsIntroduced: 0, itemsAnswered: 0, itemsCorrect: 0,
        activeMinutes: 0, dimensionsTrained: {},
      };
      return {
        ...rolled,
        words: { ...rolled.words, [wordId]: seeded },
        introducedToday,
        daily: alreadyIntroduced
          ? rolled.daily
          : { ...rolled.daily, [today]: { ...prevDaily, newWordsIntroduced: prevDaily.newWordsIntroduced + 1 } },
        firstExposure: seeded.firstExposureModality && !rolled.firstExposure[wordId]
          ? { ...rolled.firstExposure, [wordId]: seeded.firstExposureModality }
          : rolled.firstExposure,
      };
    }),

  commitEvent: (raw, opts) => set((state) => applyEventToState(rollIntroducedToday(state, raw.timestamp), raw, opts)),

  commitEvents: (raws, opts) =>
    set((state) => {
      let next: PersistedProgress = state;
      for (const raw of raws) next = applyEventToState(rollIntroducedToday(next, raw.timestamp), raw, opts);
      return next;
    }),

  recordSpellingError: (wordId, kind, now) =>
    set((state) => {
      const existing = state.words[wordId] ?? freshWordProgress(wordId, now);
      const errorProfile = { ...existing.errorProfile, [kind]: (existing.errorProfile[kind] ?? 0) + 1 };
      return { ...state, words: { ...state.words, [wordId]: { ...existing, errorProfile, updatedAt: now } } };
    }),

  addConfusionSignal: (a, b, signal, now, prior = false) =>
    set((state) => ({ ...state, confusion: applyConfusionSignal(state.confusion, a, b, signal, now, prior) })),

  resolveConfusion: (a, b, correct, now) =>
    set((state) => ({ ...state, confusion: recordDiscrimination(state.confusion, a, b, correct, now) })),

  addActiveMinutes: (date, minutes) =>
    set((state) => {
      const prev: DailyLog = state.daily[date] ?? {
        date, newWordsIntroduced: 0, itemsAnswered: 0, itemsCorrect: 0,
        activeMinutes: 0, dimensionsTrained: {},
      };
      return { ...state, daily: { ...state.daily, [date]: { ...prev, activeMinutes: prev.activeMinutes + minutes } } };
    }),

  setOnboardingDone: () => set(() => ({ onboardingDone: true })),

  replaceAll: (progress) => set(() => ({ ...progress })),

  resetProgress: () => set(() => ({ ...emptyProgress() })),
}));

/** Serializable snapshot for persistence (actions + hydration flag stripped). */
export function progressSnapshot(): PersistedProgress {
  const s = useProgress.getState();
  const {
    hydrate: _h, meetWord: _m, commitEvent: _c, commitEvents: _cs,
    addConfusionSignal: _a, resolveConfusion: _r, addActiveMinutes: _am,
    setOnboardingDone: _o, replaceAll: _rp, resetProgress: _rs,
    recordSpellingError: _se, hydrated: _hy, ...rest
  } = s;
  void _h; void _m; void _c; void _cs; void _a; void _r; void _am; void _o; void _rp; void _rs; void _se; void _hy;
  return rest;
}
