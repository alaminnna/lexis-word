// Adaptive session builder (§7): pure deterministic buildSession(input).
// Same (progress, now, settings, seed) → identical plan. All randomness flows
// from mulberry32(seed); every item carries a human-readable reason.

import type {
  ActivityType, ConfusionEdge, DimensionKey, ReasonKind, SessionItem,
  SessionPlan, UserSettings, WordProgress, WordRecord,
} from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import { retentionOf } from './mastery';
import { drillableEdges } from './confusion';
import { buildOptions, optionText } from './distractors';
import {
  clozePrompt, collocationFor, formTarget, minimalPairPartner, spellingVariants,
} from './item-content';
import { containsWordOrForm } from '../../utils/text';
import { mulberry32 } from '../../utils/rng';
import { DAY_MS } from '../../utils/time';

export interface BuilderInput {
  words: WordRecord[];
  progress: Record<string, WordProgress>;
  confusion: ConfusionEdge[];
  settings: UserSettings;
  seed: number;
  now: number;
  introducedToday: string[];
  daysSinceActive: number;
  rollingSuccess: number | null; // last-40 success rate; null = insufficient data
  speechAvailable: boolean;
}

export const MEET_FOLLOWUP_GAP = 5;
export const MAX_MEETS_PER_SESSION = 8;

const DIM_LABEL: Record<DimensionKey, string> = {
  recognition: 'recognition', recall: 'recall', context: 'context',
  listening: 'listening', spelling: 'spelling', forms: 'word forms',
  collocation: 'collocation', production: 'production', writing: 'writing',
};

export function optionCountFor(rolling: number | null): number {
  if (rolling !== null && rolling < 0.7) return 3;
  if (rolling !== null && rolling > 0.92) return 5;
  return 4;
}

export function difficultyFor(activity: ActivityType, rolling: number | null): 1 | 2 | 3 {
  if (rolling !== null && rolling < 0.7) return 1;
  if (rolling !== null && rolling > 0.92) return 3;
  return activity === 'free-recall' || activity === 'sentence-production' ||
    activity === 'writing-task' || activity === 'sentence-dictation' ? 3 : 2;
}

function daysAgo(ts: number, now: number): number {
  return Math.max(0, Math.round((now - ts) / DAY_MS));
}

export function hasValidSentence(word: WordRecord): boolean {
  return containsWordOrForm(word.sentence, word.word, word.forms ?? []);
}

function partnersFor(wordId: string, confusion: ConfusionEdge[]): string[] {
  return confusion
    .filter((e) => e.a === wordId || e.b === wordId)
    .sort((x, y) => y.weight - x.weight)
    .map((e) => (e.a === wordId ? e.b : e.a));
}

interface ActivityChoice {
  activity: ActivityType;
  dimension: DimensionKey;
  options?: string[];
  answer?: string;
  prompt?: string;
  pairId?: string;
}

interface Ctx {
  byId: Map<string, WordRecord>;
  poolWords: WordRecord[];
  progress: Record<string, WordProgress>;
  confusion: ConfusionEdge[];
  rand: () => number;
  optionCount: number;
  speech: boolean;
  now: number;
}

/**
 * Map a word's weakest due dimension to a concrete activity (§7 unlock rules):
 * production only if recall ≥ 30 · dictation only with a valid sentence ·
 * listening/spelling only after introduction (all pool words are introduced).
 * Returns null when the dimension is not trainable → caller tries the next dim.
 */
function activityForDim(word: WordRecord, prog: WordProgress, dim: DimensionKey, ctx: Ctx): ActivityChoice | null {
  const s = (d: DimensionKey): number => prog.dimensions[d].strength;
  const partners = partnersFor(word.id, ctx.confusion);
  switch (dim) {
    case 'recognition': {
      const toWord = ctx.rand() < 0.5;
      const activity: ActivityType = toWord ? 'mcq-meaning-word' : 'mcq-word-meaning';
      const mode = toWord ? 'word' : 'meaning';
      const options = buildOptions(word, { words: ctx.poolWords, byId: ctx.byId }, {
        count: ctx.optionCount, confusionPartners: partners, mode, rand: ctx.rand,
      });
      return {
        activity, dimension: dim, options,
        answer: optionText(word, mode),
        // The question stem: the headword itself (word→meaning) or its
        // definition (meaning→word). An MCQ without a visible stem is broken.
        prompt: toWord ? (word.shortDefinition ?? word.word) : word.word,
      };
    }
    case 'recall': {
      const free = s('recall') >= 50; // [CHOICE] strength-gated production ladder
      return {
        activity: free ? 'free-recall' : 'cued-recall', dimension: dim,
        answer: word.word, prompt: word.shortDefinition ?? word.word,
      };
    }
    case 'context': {
      const prompt = clozePrompt(word);
      if (!prompt) return null;
      const options = buildOptions(word, { words: ctx.poolWords, byId: ctx.byId }, {
        count: ctx.optionCount, confusionPartners: partners, mode: 'word', rand: ctx.rand,
      });
      return { activity: 'context-cloze', dimension: dim, options, answer: word.word, prompt };
    }
    case 'listening': {
      if (!ctx.speech) return null;
      const strength = s('listening');
      if (strength < 40) {
        const options = buildOptions(word, { words: ctx.poolWords, byId: ctx.byId }, {
          count: ctx.optionCount, confusionPartners: partners, mode: 'meaning', rand: ctx.rand,
        });
        return { activity: 'listen-meaning', dimension: dim, options, answer: word.shortDefinition ?? word.word };
      }
      if (strength < 70 || !hasValidSentence(word)) {
        const variants = spellingVariants(word.word, ctx.optionCount - 1, ctx.rand);
        const options = [...variants, word.word];
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.rand() * (i + 1));
          [options[i], options[j]] = [options[j]!, options[i]!];
        }
        return { activity: 'listen-spelling', dimension: dim, options, answer: word.word };
      }
      // Strong listeners alternate dictation with minimal-pair identification.
      // The target word is always the spoken one (wordId/answer stay consistent);
      // options are shuffled so position leaks nothing.
      const partner = minimalPairPartner(word, ctx.poolWords, partners, ctx.rand);
      if (partner && ctx.rand() < 0.4) {
        const options = ctx.rand() < 0.5 ? [word.word, partner.word] : [partner.word, word.word];
        return {
          activity: 'minimal-pair', dimension: dim,
          options, answer: word.word, pairId: partner.id,
        };
      }
      if (hasValidSentence(word)) {
        return { activity: 'sentence-dictation', dimension: dim, answer: word.word, prompt: word.sentence };
      }
      if (partner) {
        return { activity: 'minimal-pair', dimension: dim, options: [word.word, partner.word], answer: word.word, pairId: partner.id };
      }
      return null;
    }
    case 'spelling': {
      const strength = s('spelling');
      if (strength >= 60 && ctx.speech && hasValidSentence(word)) {
        return { activity: 'sentence-dictation', dimension: 'listening', answer: word.word, prompt: word.sentence };
      }
      if (strength < 30) return { activity: 'spelling-build', dimension: dim, answer: word.word };
      return { activity: 'flash-type', dimension: dim, answer: word.word };
    }
    case 'forms': {
      const target = formTarget(word, ctx.rand);
      if (!target) return null;
      return {
        activity: 'form-transform', dimension: dim, answer: target.form,
        prompt: `Write the ${target.hint} of “${word.word}”.`,
      };
    }
    case 'collocation': {
      const sameStage = ctx.poolWords.filter((w) => w.stage === word.stage);
      const { prompt, options, collocate } = collocationFor(word, sameStage, ctx.rand);
      return { activity: 'collocation-select', dimension: dim, options, answer: collocate, prompt };
    }
    case 'production': {
      if (s('recall') < 30) return null;
      return {
        activity: 'sentence-production', dimension: dim, answer: word.word,
        prompt: `Write an original academic sentence using “${word.word}”.`,
      };
    }
    case 'writing': {
      return {
        activity: 'writing-task', dimension: dim, answer: word.word,
        prompt: `Write 1–2 academic sentences using “${word.word}” correctly.`,
      };
    }
  }
}

/** Weakest trainable due dimension for a word (null when nothing is trainable). */
function weakestDueDim(
  word: WordRecord, prog: WordProgress, now: number, ctx: Ctx, onlyDue: boolean,
): { dim: DimensionKey; urgency: number } | null {
  let best: { dim: DimensionKey; urgency: number } | null = null;
  let bestStrength = Infinity;
  for (const dim of DIMENSIONS) {
    const st = prog.dimensions[dim];
    if (st.attempts === 0) continue;
    if (onlyDue && st.nextDueAt > now) continue;
    // Unlock pre-checks before costlier content building.
    if (dim === 'listening' && !ctx.speech) continue;
    if (dim === 'production' && prog.dimensions.recall.strength < 30) continue;
    if (dim === 'forms' && (word.forms ?? []).length === 0) continue;
    if (dim === 'context' && !hasValidSentence(word)) continue;
    const ret = retentionOf(st, now);
    const urgency = (1 - ret.retention) * (1 + ret.overdueDays);
    if (st.strength < bestStrength - 1e-9 ||
      (Math.abs(st.strength - bestStrength) < 1e-9 && best !== null && urgency > best.urgency)) {
      // Verify trainability (content availability) before committing.
      if (!activityForDim(word, prog, dim, ctx)) continue;
      bestStrength = st.strength;
      best = { dim, urgency };
    }
  }
  return best;
}

function makeItem(
  word: WordRecord, choice: ActivityChoice, kind: SessionItem['reason']['kind'],
  humanText: string, rolling: number | null,
): SessionItem {
  return {
    wordId: word.id,
    activity: choice.activity,
    dimension: choice.dimension,
    difficulty: difficultyFor(choice.activity, rolling),
    options: choice.options,
    answer: choice.answer,
    prompt: choice.prompt,
    pairId: choice.pairId,
    reason: { kind, humanText },
  };
}

function dueReason(prog: WordProgress, dim: DimensionKey, now: number): { kind: ReasonKind; text: string } {
  const st = prog.dimensions[dim];
  const ago = daysAgo(st.lastReviewedAt, now);
  const when = ago === 0 ? 'earlier today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
  const outcome = st.recent[st.recent.length - 1] === false ? 'missed' : 'answered';
  const base = `Due for ${DIM_LABEL[dim]} review — ${outcome} ${when}.`;
  if (prog.masteryStage === 5) {
    const stable = Math.max(0, Math.round(st.lastIntervalDays));
    return { kind: 'maintenance', text: `Maintenance check — stable for ${stable} days. Still solid?` };
  }
  return { kind: 'due-review', text: base };
}

function stageName(n: number): string {
  return `Stage ${n + 1}`;
}

/** Build a meet triple: Meet card + Stage-1 MCQ + Stage-2 reverse MCQ (§8). */
function buildMeetTriple(w: WordRecord, words: WordRecord[], byId: Map<string, WordRecord>,
  ctx: Ctx, rolling: number | null): SessionItem[] {
  const meet: SessionItem = {
    wordId: w.id, activity: 'meet', dimension: 'recognition', difficulty: 1,
    reason: { kind: 'new-introduction', humanText: `New word — ${stageName(w.stage)} (word ${w.rank} of ${words.length}).` },
  };
  const f1mcq = buildOptions(w, { words, byId }, {
    count: ctx.optionCount, confusionPartners: [], mode: 'meaning', rand: ctx.rand,
  });
  const f1: SessionItem = {
    wordId: w.id, activity: 'mcq-word-meaning', dimension: 'recognition',
    difficulty: difficultyFor('mcq-word-meaning', rolling),
    options: f1mcq, answer: optionText(w, 'meaning'), prompt: w.word,
    reason: { kind: 'new-introduction', humanText: `First recognition check — you met ${w.word} a few minutes ago.` },
  };
  const f2mcq = buildOptions(w, { words, byId }, {
    count: ctx.optionCount, confusionPartners: [], mode: 'word', rand: ctx.rand,
  });
  const f2: SessionItem = {
    wordId: w.id, activity: 'mcq-meaning-word', dimension: 'recognition',
    difficulty: difficultyFor('mcq-meaning-word', rolling),
    options: f2mcq, answer: w.word, prompt: w.shortDefinition ?? w.word,
    reason: { kind: 'new-introduction', humanText: `Reverse check — can you pick ${w.word} out by meaning?` },
  };
  return [meet, f1, f2];
}

/** Discrimination item for a confusion edge (seeded variant). */
function discriminationItem(a: WordRecord, b: WordRecord, ctx: Ctx): SessionItem | null {
  const roll = ctx.rand();
  const first = ctx.rand() < 0.5 ? a : b;
  const other = first.id === a.id ? b : a;
  const pairText = `Confusion pair: ${a.word} / ${b.word} — let's separate them.`;
  if (roll < 0.4) {
    // Gap-fit variant (context).
    const prompt = clozePrompt(first) ?? clozePrompt(other);
    if (!prompt) return null;
    const target = clozePrompt(first) ? first : other;
    const otherW = target.id === a.id ? b : a;
    return {
      wordId: target.id, activity: 'discrimination', dimension: 'context',
      difficulty: difficultyFor('discrimination', null),
      options: [target.word, otherW.word], answer: target.word, prompt, pairId: otherW.id,
      reason: { kind: 'confusion-pair', humanText: pairText },
    };
  }
  if (roll < 0.7 && ctx.speech) {
    // Heard-word variant (listening).
    return {
      wordId: first.id, activity: 'discrimination', dimension: 'listening',
      difficulty: difficultyFor('discrimination', null),
      options: [a.word, b.word], answer: first.word, pairId: other.id,
      reason: { kind: 'confusion-pair', humanText: pairText },
    };
  }
  // Spell-the-meaning variant (spelling).
  const def = first.shortDefinition ?? first.word;
  return {
    wordId: first.id, activity: 'discrimination', dimension: 'spelling',
    difficulty: difficultyFor('discrimination', null),
    answer: first.word, prompt: `Spell the word that means: “${def}”.`, pairId: other.id,
    reason: { kind: 'confusion-pair', humanText: pairText },
  };
}

export function buildSession(input: BuilderInput): SessionPlan {
  const { words, progress, confusion, settings, seed, introducedToday, daysSinceActive, rollingSuccess, speechAvailable } = input;
  // Clock-skew guard: never plan against a future-biased clock (§22).
  let now = input.now;
  for (const id of Object.keys(progress)) {
    const p = progress[id]!;
    for (const d of DIMENSIONS) {
      if (p.dimensions[d].lastReviewedAt > now) now = p.dimensions[d].lastReviewedAt;
    }
  }
  const rand = mulberry32(seed);
  const byId = new Map(words.map((w) => [w.id, w]));
  const ctx: Ctx = {
    byId, poolWords: words, progress, confusion, rand,
    optionCount: optionCountFor(rollingSuccess), speech: speechAvailable, now,
  };

  const N = Math.min(25, Math.max(10, Math.round(settings.sessionLengthTarget)));
  const introduced = (id: string): boolean => {
    const p = progress[id];
    return !!p && p.introducedAt > 0;
  };
  const activeCount = words.filter((w) => {
    const p = progress[w.id];
    return p && p.masteryStage >= 1 && p.masteryStage <= 4;
  }).length;

  // ---- Warm-up: one high-confidence due item (R > 0.9). ----
  let warmup: SessionItem | null = null;
  {
    let bestR = 0.9;
    let best: { word: WordRecord; prog: WordProgress; dim: DimensionKey } | null = null;
    for (const word of words) {
      const prog = progress[word.id];
      if (!prog || prog.introducedAt === 0) continue;
      for (const dim of DIMENSIONS) {
        const st = prog.dimensions[dim];
        if (st.attempts === 0 || st.nextDueAt > now) continue;
        const r = retentionOf(st, now).retention;
        if (r > bestR) {
          const choice = activityForDim(word, prog, dim, ctx);
          if (choice) {
            bestR = r;
            best = { word, prog, dim };
          }
        }
      }
    }
    if (best) {
      const choice = activityForDim(best.word, best.prog, best.dim, ctx)!;
      warmup = makeItem(best.word, choice, 'warm-up',
        `Warm-up — ${best.word.word} is fresh in memory (${Math.round(bestR * 100)}% recall likelihood).`, rollingSuccess);
    }
  }

  // ---- Due reviews (one item per word: its weakest due dimension). ----
  interface DueCand { word: WordRecord; prog: WordProgress; dim: DimensionKey; urgency: number }
  const dueCands: DueCand[] = [];
  for (const word of words) {
    const prog = progress[word.id];
    if (!prog || prog.introducedAt === 0) continue;
    const weakest = weakestDueDim(word, prog, now, ctx, true);
    if (weakest) dueCands.push({ word, prog, dim: weakest.dim, urgency: weakest.urgency });
  }
  dueCands.sort((x, y) => y.urgency - x.urgency || x.word.rank - y.word.rank);
  const dueQuota = Math.round(N * 0.5);
  const dueItems: SessionItem[] = [];
  const usedWords = new Set<string>(warmup ? [warmup.wordId] : []);
  for (const cand of dueCands) {
    if (dueItems.length >= dueQuota || usedWords.has(cand.word.id)) continue;
    const choice = activityForDim(cand.word, cand.prog, cand.dim, ctx);
    if (!choice) continue;
    const r = dueReason(cand.prog, cand.dim, now);
    dueItems.push(makeItem(cand.word, choice, r.kind, r.text, rollingSuccess));
    usedWords.add(cand.word.id);
  }

  // ---- Weak safety-net: lowest-strength attempted dims (strength < 40). ----
  const weakQuota = Math.round(N * 0.15);
  const weakItems: SessionItem[] = [];
  {
    interface WeakCand { word: WordRecord; prog: WordProgress; dim: DimensionKey; strength: number }
    const cands: WeakCand[] = [];
    for (const word of words) {
      const prog = progress[word.id];
      if (!prog || prog.introducedAt === 0 || usedWords.has(word.id)) continue;
      for (const dim of DIMENSIONS) {
        const st = prog.dimensions[dim];
        if (st.attempts === 0 || st.strength >= 40) continue;
        if (dim === 'listening' && !speechAvailable) continue;
        if (dim === 'production' && prog.dimensions.recall.strength < 30) continue;
        if (dim === 'forms' && (word.forms ?? []).length === 0) continue;
        if (dim === 'context' && !hasValidSentence(word)) continue;
        if (!activityForDim(word, prog, dim, ctx)) continue;
        cands.push({ word, prog, dim, strength: st.strength });
      }
    }
    cands.sort((x, y) => x.strength - y.strength || x.word.rank - y.word.rank);
    const pickedWords = new Set<string>();
    for (const cand of cands) {
      if (weakItems.length >= weakQuota || pickedWords.has(cand.word.id) || usedWords.has(cand.word.id)) continue;
      const choice = activityForDim(cand.word, cand.prog, cand.dim, ctx);
      if (!choice) continue;
      const st = cand.prog.dimensions[cand.dim];
      const misses = st.recent.filter((ok) => !ok).length;
      const text = misses > 0
        ? `Weak in ${DIM_LABEL[cand.dim]} — ${misses} recent miss${misses === 1 ? '' : 'es'}.`
        : `Weak in ${DIM_LABEL[cand.dim]} — strength ${Math.round(st.strength)}/100.`;
      weakItems.push(makeItem(cand.word, choice, 'weak-dimension', text, rollingSuccess));
      pickedWords.add(cand.word.id);
      usedWords.add(cand.word.id);
    }
  }

  // ---- Confusion pairs: 1–2 discrimination items. ----
  const confQuota = Math.min(2, Math.round(N * 0.1));
  const confItems: SessionItem[] = [];
  for (const edge of drillableEdges(confusion)) {
    if (confItems.length >= confQuota) break;
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    if (!a || !b || !introduced(a.id) || !introduced(b.id)) continue;
    if (usedWords.has(a.id) || usedWords.has(b.id)) continue;
    const item = discriminationItem(a, b, ctx);
    if (!item) continue;
    confItems.push(item);
    usedWords.add(item.wordId);
  }

  // ---- Introduction ladder stages 3–4 (time-critical follow-ups). ----
  interface LadderUnit { items: SessionItem[]; wordId: string }
  const ladderUnits: LadderUnit[] = [];
  {
    const cands = words
      .filter((w) => introduced(w.id) && !usedWords.has(w.id))
      .map((w) => ({ w, p: progress[w.id]! }))
      .filter(({ p }) => p.masteryStage >= 1)
      .sort((x, y) => x.p.introducedAt - y.p.introducedAt);
    for (const { w, p } of cands) {
      const items: SessionItem[] = [];
      const ageMs = now - p.introducedAt;
      if (p.dimensions.recall.attempts === 0 && ageMs >= DAY_MS) {
        // Stage 3 (≥24h): cued recall + listening MCQ.
        items.push(makeItem(w,
          { activity: 'cued-recall', dimension: 'recall', answer: w.word, prompt: w.shortDefinition ?? w.word },
          'new-introduction', `Introduction follow-up — first unsupported recall, a day after meeting ${w.word}.`, rollingSuccess));
        if (speechAvailable) {
          const choice = activityForDim(w, p, 'listening', ctx);
          if (choice) {
            items.push(makeItem(w, choice, 'new-introduction',
              `Introduction follow-up — hearing ${w.word} for the first time since meeting it.`, rollingSuccess));
          }
        }
      } else if (p.dimensions.spelling.attempts === 0 && ageMs >= 2 * DAY_MS && p.dimensions.recall.attempts > 0) {
        // Stage 4 (≥48h): spelling + context cloze.
        const spellChoice = speechAvailable && hasValidSentence(w)
          ? { activity: 'sentence-dictation', dimension: 'listening', answer: w.word, prompt: w.sentence } as ActivityChoice
          : { activity: 'spelling-build', dimension: 'spelling', answer: w.word } as ActivityChoice;
        items.push(makeItem(w, spellChoice, 'new-introduction',
          `Introduction follow-up — spelling ${w.word} two days after meeting it.`, rollingSuccess));
        const cloze = clozePrompt(w);
        if (cloze) {
          const options = buildOptions(w, { words, byId }, {
            count: ctx.optionCount, confusionPartners: partnersFor(w.id, confusion), mode: 'word', rand,
          });
          items.push(makeItem(w,
            { activity: 'context-cloze', dimension: 'context', options, answer: w.word, prompt: cloze },
            'new-introduction', `Introduction follow-up — seeing ${w.word} in context.`, rollingSuccess));
        } else {
          items.push(makeItem(w,
            { activity: 'free-recall', dimension: 'recall', answer: w.word, prompt: w.shortDefinition ?? w.word },
            'new-introduction', `Introduction follow-up — recalling ${w.word} without cues.`, rollingSuccess));
        }
      }
      if (items.length > 0) {
        ladderUnits.push({ items, wordId: w.id });
        usedWords.add(w.id);
      }
    }
  }

  // ---- New words (meet + same-session ladder), gated. ----
  // Room-based fill: review pools take their quotas first; introductions use
  // the remaining slots (~20% in steady state, more when reviews run dry).
  const newWords: { word: WordRecord; triple: SessionItem[] }[] = [];
  {
    const budgetLeft = settings.dailyNewTarget - introducedToday.length;
    const reentry = daysSinceActive > 3;
    const canIntroduce = budgetLeft > 0 && activeCount < settings.maxActiveWords && !reentry &&
      words.some((w) => !introduced(w.id) && !introducedToday.includes(w.id));
    const baseOthers = (warmup ? 1 : 0) + dueItems.length + weakItems.length + confItems.length +
      ladderUnits.reduce((n, u) => n + u.items.length, 0);
    let room = Math.max(0, N - baseOthers);
    if (canIntroduce && room < 3 && dueItems.length > Math.max(1, dueQuota - 3)) {
      // Guarantee room for at least one introduction triple by trimming the
      // lowest-urgency due items — the ~20% new-word share is a quota, not a wish.
      while (room < 3 && dueItems.length > Math.max(1, dueQuota - 3)) {
        const dropped = dueItems.pop()!;
        usedWords.delete(dropped.wordId);
        room++;
      }
    }
    const maxTriples = canIntroduce
      ? Math.min(budgetLeft, MAX_MEETS_PER_SESSION, Math.floor(room / 3))
      : 0;
    if (maxTriples > 0) {
      const fresh = words.filter((w) => !introduced(w.id) && !introducedToday.includes(w.id))
        .sort((a, b) => a.rank - b.rank);
      for (const w of fresh.slice(0, maxTriples)) {
        newWords.push({ word: w, triple: buildMeetTriple(w, words, byId, ctx, rollingSuccess) });
      }
    }
  }

  // ---- Assemble: warmup → meets → greedy interleave (no shared activity adjacent). ----
  // [CHOICE] Micro-sessions lay each triple down atomically — meet, recognition,
  // reverse — instead of spacing follow-ups ≥5 apart (impossible when the whole
  // plan is smaller than the gap; the old rule stranded follow-ups and the
  // repair pass then dropped the lonely meet → EMPTY plan → dead loop).
  // Consecutive triples still alternate activity types, so interleaving holds.
  // Trigger: short target length OR total planned content that fits in 8 slots.
  const plannedContent = newWords.length * 3 + ((warmup ? 1 : 0) + dueItems.length + weakItems.length + confItems.length +
    ladderUnits.reduce((n, u) => n + u.items.length, 0));
  const micro = N < 8 || (newWords.length > 0 && plannedContent <= 8);
  const followupGap = micro ? 1 : MEET_FOLLOWUP_GAP;
  const placed: SessionItem[] = [];
  if (warmup) placed.push(warmup);
  const meetIdx = new Map<string, number>();
  interface Pending { item: SessionItem; pool: 'f1' | 'f2' | 'due' | 'weak' | 'ladder' | 'conf'; meetAt?: number }
  const pending: Pending[] = [];
  for (const nw of newWords) {
    meetIdx.set(nw.word.id, placed.length);
    placed.push(nw.triple[0]!);
    if (micro) {
      placed.push(nw.triple[1]!, nw.triple[2]!);
    } else {
      pending.push({ item: nw.triple[1]!, pool: 'f1', meetAt: meetIdx.get(nw.word.id) });
      pending.push({ item: nw.triple[2]!, pool: 'f2', meetAt: meetIdx.get(nw.word.id) });
    }
  }
  for (const d of dueItems) pending.push({ item: d, pool: 'due' });
  for (const wk of weakItems) pending.push({ item: wk, pool: 'weak' });
  for (const u of ladderUnits) for (const it of u.items) pending.push({ item: it, pool: 'ladder' });
  for (const c of confItems) pending.push({ item: c, pool: 'conf' });

  const poolRank: Record<Pending['pool'], number> = { f1: 0, due: 1, weak: 2, ladder: 3, conf: 4, f2: 5 };
  const remaining = (pool: Pending['pool']): number => pending.filter((p) => p.pool === pool).length;

  while (placed.length < N && pending.length > 0) {
    const slotsLeft = N - placed.length;
    const lastActivity = placed.length > 0 ? placed[placed.length - 1]!.activity : null;
    const f2Left = remaining('f2');
    // End-pack mode: f2 follow-ups must land at the session end.
    const endPack = slotsLeft - f2Left <= 2 && f2Left > 0;
    const ordered = [...pending].sort((a, b) => {
      const ra = endPack ? (a.pool === 'f2' ? -1 : 1) : 0;
      const rb = endPack ? (b.pool === 'f2' ? -1 : 1) : 0;
      if (ra !== rb) return ra - rb;
      return poolRank[a.pool] - poolRank[b.pool];
    });
    let picked = -1;
    // Pass 1: eligible item with a different activity (meets are exempt upstream;
    // retrieval items strictly alternate). f1 needs ≥5 items after its meet.
    for (let i = 0; i < ordered.length; i++) {
      const cand = ordered[i]!;
      if (cand.pool === 'f1' && placed.length - (cand.meetAt ?? 0) < followupGap) continue;
      if (cand.pool === 'f2' && !endPack) continue;
      if (cand.item.activity === lastActivity) continue;
      picked = pending.indexOf(cand);
      break;
    }
    // Pass 2: forced — same activity allowed only when nothing else is eligible.
    if (picked < 0) {
      for (let i = 0; i < ordered.length; i++) {
        const cand = ordered[i]!;
        if (cand.pool === 'f1' && placed.length - (cand.meetAt ?? 0) < followupGap) continue;
        if (cand.pool === 'f2' && !endPack && slotsLeft - f2Left > 0) continue;
        picked = pending.indexOf(cand);
        break;
      }
    }
    if (picked < 0) break; // only ineligible followups remain (session ends early)
    placed.push(pending[picked]!.item);
    pending.splice(picked, 1);
  }

  // Repair: drop incomplete meet triples only. Same-session follow-ups
  // (mcq-*-meaning for a meet word) require their meet; every review, ladder,
  // warm-up, and confusion item stands on its own and always stays.
  const FOLLOWUP = new Set(['mcq-word-meaning', 'mcq-meaning-word']);
  const meetWords = new Set(
    placed.filter((it) => it.activity === 'meet').map((it) => it.wordId),
  );
  const followupCount = new Map<string, number>();
  for (const it of placed) {
    if (FOLLOWUP.has(it.activity) && meetWords.has(it.wordId)) {
      followupCount.set(it.wordId, (followupCount.get(it.wordId) ?? 0) + 1);
    }
  }
  const complete = placed.filter((it) => {
    if (it.activity === 'meet') return (followupCount.get(it.wordId) ?? 0) >= 1;
    if (FOLLOWUP.has(it.activity) && meetWords.has(it.wordId)) return true; // meet is present
    return true; // review / ladder / warm-up / confusion items always stay
  });
  const topped = [...complete];

  // Maintenance fallback: nothing due anywhere → sample highest-risk dims.
  if (topped.length === 0) {
    interface RiskCand { word: WordRecord; prog: WordProgress; dim: DimensionKey; risk: number }
    const cands: RiskCand[] = [];
    for (const word of words) {
      const prog = progress[word.id];
      if (!prog || prog.introducedAt === 0) continue;
      for (const dim of DIMENSIONS) {
        const st = prog.dimensions[dim];
        if (st.attempts === 0) continue;
        const r = retentionOf(st, now).risk;
        if (activityForDim(word, prog, dim, ctx)) {
          cands.push({ word, prog, dim, risk: r });
        }
      }
    }
    cands.sort((x, y) => y.risk - x.risk || x.word.rank - y.word.rank);
    for (const cand of cands.slice(0, N)) {
      const choice = activityForDim(cand.word, cand.prog, cand.dim, ctx)!;
      topped.push(makeItem(cand.word, choice, 'maintenance',
        `Maintenance check — ${cand.word.word} has waited longest.`, rollingSuccess));
    }
  }

  return {
    id: `ses_${now.toString(36)}_${seed.toString(36)}`,
    createdAt: now,
    seed,
    items: topped.slice(0, N),
  };
}
