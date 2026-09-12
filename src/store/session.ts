// Session resume: persists the active plan + cursor so a refresh mid-session
// never loses committed answers and offers resume (§20). Retry queues and
// transient UI state live in the runner component, not here.

import { create } from 'zustand';
import type { SessionPlan } from '../types/domain';
const SESSION_KEY = 'lexis:session:v1';

export interface SavedSession {
  plan: SessionPlan;
  index: number;
  startedAt: number;
}

interface SessionPersistState {
  saved: SavedSession | null;
  launch: SessionPlan | null;
  save: (plan: SessionPlan, index: number) => void;
  clear: () => void;
  hydrate: () => void;
  /** Queue a prebuilt plan (checkpoint, lab drill, word practice) for /learn. */
  launchPlan: (plan: SessionPlan) => void;
  consumeLaunch: () => SessionPlan | null;
  /** Drop an unconsumed launch (called when leaving /learn without using it). */
  clearLaunch: () => void;
}

const RESUME_TTL_MS = 24 * 60 * 60 * 1000;
const VALID_ACTIVITIES = new Set([
  'meet', 'mcq-word-meaning', 'mcq-meaning-word', 'listen-meaning',
  'listen-spelling', 'minimal-pair', 'cued-recall', 'free-recall',
  'spelling-build', 'flash-type', 'sentence-dictation', 'context-cloze',
  'collocation-select', 'form-transform', 'sentence-production',
  'discrimination', 'writing-task',
]);

function read(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { plan, index, startedAt } = parsed as { plan?: unknown; index?: unknown; startedAt?: unknown };
    if (typeof plan !== 'object' || plan === null) return null;
    const { items } = plan as { items?: unknown };
    if (!Array.isArray(items) || items.length === 0) return null;
    const started = typeof startedAt === 'number' ? startedAt : Date.now();
    // Stale cursors (days old) do more harm than good — expire after 24h.
    if (!Number.isFinite(started) || Date.now() - started > RESUME_TTL_MS) {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      return null;
    }
    const idx = typeof index === 'number' && Number.isFinite(index)
      ? Math.min(Math.max(0, Math.floor(index)), items.length - 1)
      : 0;
    // Validate items minimally: wordId + known activity.
    for (const it of items) {
      if (typeof it !== 'object' || it === null) return null;
      const r = it as { wordId?: unknown; activity?: unknown };
      if (typeof r.wordId !== 'string' || typeof r.activity !== 'string') return null;
      if (!VALID_ACTIVITIES.has(r.activity)) return null;
    }
    return {
      plan: plan as SessionPlan,
      index: idx,
      startedAt: started,
    };
  } catch {
    return null;
  }
}

export const useSessionPersist = create<SessionPersistState>()((set, get) => ({
  saved: null,
  launch: null,
  save: (plan, index) => {
    const saved: SavedSession = { plan, index, startedAt: Date.now() };
    set(() => ({ saved }));
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
    } catch {
      // Resume is best-effort; committed progress is already safe elsewhere.
    }
  },
  clear: () => {
    set(() => ({ saved: null }));
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  },
  hydrate: () => set(() => ({ saved: read() })),
  launchPlan: (plan) => set(() => ({ launch: plan })),
  consumeLaunch: () => {
    const plan = get().launch;
    if (plan) set(() => ({ launch: null }));
    return plan;
  },
  clearLaunch: () => set(() => ({ launch: null })),
}));
