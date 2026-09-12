// Lexis domain contracts — implements §19 of the spec.
// Extensions beyond the spec are documented inline.

export type DimensionKey =
  | 'recognition' | 'recall' | 'context' | 'listening' | 'spelling'
  | 'forms' | 'collocation' | 'production' | 'writing';

export const DIMENSIONS: DimensionKey[] = [
  'recognition', 'recall', 'context', 'listening', 'spelling',
  'forms', 'collocation', 'production', 'writing',
];

export type ActivityType =
  | 'meet' | 'mcq-word-meaning' | 'mcq-meaning-word' | 'listen-meaning'
  | 'listen-spelling' | 'minimal-pair' | 'cued-recall' | 'free-recall'
  | 'spelling-build' | 'flash-type' | 'sentence-dictation' | 'context-cloze'
  | 'collocation-select' | 'form-transform' | 'sentence-production'
  | 'discrimination' | 'writing-task';

/** The file's actual shape in word.md: a bare headword inside an HTML table cell. */
export interface RawVocabRow {
  word: string;
  list: number; // sequential table number (1–5), each table = 100 labelled words
}

/** One entry of the companion gloss files (src/data/glosses/part-N.json). */
export interface GlossEntry {
  word: string;
  pos: string;
  def: string;
  bengali: string;
  forms: string[];
  sentence: string;
}

export interface WordRecord {
  id: string;                    // stable slug
  word: string;                  // trimmed headword
  rank: number;                  // original file order = priority
  stage: number;                 // roadmap stage 0–9
  freqLevel?: number;
  bengali?: string | string[];   // from the real dataset, if present
  pos?: string[];
  shortDefinition?: string;
  forms?: string[];
  topics?: string[];
  /** Local study example (NOT an IELTS passage — displayed without source framing). */
  sentence: string;
}

export interface DictionaryEntry {      // normalized API response (HTML stripped)
  word: string; fetchedAt: number;
  defs: { word: string; freqLevel?: number; forms: string[];
          definitions: { def: string; pos?: string;
                         examples: { sentence: string; source?: string }[] }[] }[];
  examples: { sentence: string; source?: string }[];
}

export interface DimensionState {
  strength: number;              // 0–100
  streak: number; lapses: number; attempts: number; successes: number;
  lastReviewedAt: number; nextDueAt: number; lastIntervalDays: number;
  /** Extension: last two outcomes (true = correct). Required by the stage-5
   *  "zero lapses in the last two attempts" rubric (§6). Max length 2. */
  recent: boolean[];
}

export type MasteryStage = 0 | 1 | 2 | 3 | 4 | 5;

export interface WordProgress {
  wordId: string; introducedAt: number;
  masteryStage: MasteryStage;
  dimensions: Record<DimensionKey, DimensionState>;
  firstExposureModality: ActivityType | null;
  errorProfile: Record<string, number>;
  updatedAt: number;
}

export type Confidence = 'sure' | 'shaky' | 'unsure';

export interface LearningEvent {
  id: string; sessionId: string; wordId: string;
  activity: ActivityType; dimension: DimensionKey;
  correct: boolean; responseMs: number;
  confidence?: Confidence;
  hintsUsed: number; audioReplays: number;
  detail?: { typed?: string; chosenOption?: string; target?: string; aiVerified?: boolean; reflection?: string };
  timestamp: number;
}

export type ReasonKind = 'new-introduction' | 'due-review' | 'weak-dimension'
  | 'confusion-pair' | 'in-session-retry' | 'maintenance' | 'warm-up';

export interface SessionItem {
  wordId: string; activity: ActivityType; dimension: DimensionKey;
  difficulty: 1 | 2 | 3;
  options?: string[];        // MCQ / selection option payloads (meanings or words)
  answer?: string;           // canonical correct answer for grading
  prompt?: string;           // pre-built stimulus text (sentence with blank, dictation text…)
  pairId?: string;           // second word id for discrimination items
  reason: { kind: ReasonKind; humanText: string };
}

export interface SessionPlan { id: string; createdAt: number; seed: number; items: SessionItem[];
  /** Extension: launch context for custom sessions (checkpoint / review / lab / word practice).
   *  The adaptive engine never reads this; the runner uses it for completion handling. */
  meta?: { kind: 'checkpoint'; stage: number } | { kind: 'review'; filter: string } | { kind: 'practice'; wordId: string } | { kind: 'lab'; lab: string };
}

export interface ConfusionEdge { a: string; b: string; weight: number; lastAt: number; resolvedStreak: number; }

export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0..1
  theme: 'chime' | 'pulse';
  playCorrect: boolean;
  playIncorrect: boolean;
  playUiTap: boolean;
  playComplete: boolean;
}

export interface HapticsSettings {
  enabled: boolean;
  intensity: 'light' | 'medium' | 'strong';
  onCorrect: boolean;
  onIncorrect: boolean;
}

export interface UserSettings {
  dailyNewTarget: number;        // default 8, clamp 4–15
  maxActiveWords: number;        // default 90
  sessionLengthTarget: number;   // default 15
  bengaliPolicy: 'always' | 'on-demand' | 'fade';
  preferredVoiceURI?: string;
  speechRate: 0.75 | 0.9 | 1;
  theme: 'light' | 'dark';
  seed: number;
  sound: SoundSettings;
  haptics: HapticsSettings;
}

export interface DailyLog {
  date: string;                  // 'YYYY-MM-DD'
  newWordsIntroduced: number; itemsAnswered: number; itemsCorrect: number;
  activeMinutes: number;
  dimensionsTrained: Partial<Record<DimensionKey, number>>;
}

/** Persistent progress store shape (localStorage, versioned). */
export interface PersistedProgress {
  version: 1;
  words: Record<string, WordProgress>;
  confusion: ConfusionEdge[];
  daily: Record<string, DailyLog>;
  events: LearningEvent[];       // rolling log, compacted after 30 days
  introducedToday: { date: string; wordIds: string[] };
  onboardingDone: boolean;
  firstExposure: Record<string, ActivityType>;
}
