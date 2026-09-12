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

function read(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { plan, index, startedAt } = parsed as { plan?: unknown; index?: unknown; startedAt?: unknown };
    if (typeof plan !== 'object' || plan === null) return null;
    const { items } = plan as { items?: unknown };
    if (!Array.isArray(items)) return null;
    return {
      plan: plan as SessionPlan,
      index: typeof index === 'number' ? index : 0,
      startedAt: typeof startedAt === 'number' ? startedAt : Date.now(),
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
