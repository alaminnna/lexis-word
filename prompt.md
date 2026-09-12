# MASTER BUILD PROMPT — "LEXIS: IELTS Academic Vocabulary Mastery System"

**Instruction to the coding AI:** Read this entire specification before writing any code. This document is your single source of truth. Where it prescribes exact formulas, thresholds, names, and behaviors, follow them precisely — they encode deliberate learning-science and product decisions. Where it requires you to inspect real data, do so before making assumptions. Build a functional product, not a visual prototype.

---

## 0. Global Non-Negotiables

These rules override any shortcut. Violating any of them means the build has failed, regardless of how polished it looks.

1. The learner must never be confronted with the full weight of 500 words. The home screen shows only today's slice.
2. The system always shows the next useful action — never a menu of everything.
3. Every word carries a persistent, multidimensional memory state, not a boolean "learned" flag.
4. Every interaction (correct, incorrect, hint used, audio replayed, confidence reported) emits a `LearningEvent` that updates state.
5. A word is never "mastered" after one correct answer. Mastery requires repeated, spaced confirmation across multiple skill dimensions.
6. Recognition and free recall are separate dimensions with separate schedules. A correct multiple-choice answer must never advance the recall schedule the way a correct free-recall answer does.
7. Listening and spelling are separate dimensions, trained by separate activities.
8. Weak and at-risk words are revisited intelligently, based on predicted forgetting, not fixed loops.
9. The app teaches *usage* — context, collocation, forms, sentence production — not only meaning.
10. The visual and interaction design must feel calm, premium, adult, and focused. No confetti, coins, mascots, or streak pressure.
11. The core learning engine is deterministic and explainable. No AI API is required for any core interaction.
12. Any AI feature (e.g., writing feedback) is modular, optional, and behind an interface with a working no-AI default.
13. The actual supplied vocabulary dataset is the source of truth. Never invent, replace, or supplement words.
14. All 500 words must be fully learnable offline. The dictionary API is enrichment, never a dependency.
15. Strict TypeScript. No `any` types, no mock data standing in for the real dataset, no dead buttons, no fake progress.

---

## 1. Role and Mission

You are building an **adaptive, evidence-informed IELTS Academic vocabulary acquisition platform** — an intelligent personal vocabulary coach, not a flashcard app.

The distinction is fundamental:

- A flashcard app stores cards and shows them on a timer.
- This system maintains a **per-word, per-skill memory model** of the learner, predicts which words are decaying, diagnoses *why* a word is weak (can't recall it? can't hear it? can't spell it? confuses it with another word? can't use it in a sentence?), and selects the exact next activity that addresses that weakness.

Your mission: implement a deterministic learning engine, a multidimensional mastery model, a battery of 15+ distinct activity types, three specialized labs (Listening, Spelling, Discrimination), a Writing Studio, a psychologically managed 500-word roadmap, full local persistence, and a premium calm UI — as a production-quality React + TypeScript application.

---

## 2. Product Vision

**Working title:** *Lexis — IELTS Academic Vocabulary Mastery*

The emotional experience to create:

- **A trusted coach, not a quiz machine.** The learner should feel the system *knows* them: "This word is fading — you last recalled it 6 days ago." Every session item carries a visible, human-readable reason for why it appeared. This transparency builds both trust and metacognitive awareness.
- **Quiet momentum.** Progress is communicated through typography, subtle motion, and honest numbers ("187 words in active memory"). No gamified noise. The dopamine comes from *visible competence*, not from badges.
- **Deep mastery over shallow clicks.** The system never lets the learner "click to know" a word. It walks each word through a pipeline: encounter → recognize → recall → hear → spell → use in context → produce in writing → confirmed long-term retention.
- **Respect for the learner's L1 (Bengali) without dependence on it.** Bengali meanings are scaffolding — available on demand, gradually withdrawn as recall strengthens. The learner is a Bengali-speaking IELTS Academic candidate preparing for real reading, listening, and writing performance.

The learner's success criterion: 6 months from now, when they encounter these 500 words in an actual IELTS passage, they recognize them instantly, hear them correctly, spell them accurately, and can deploy them in Task 2 essays.

---

## 3. Source Data Analysis (Do This First — Phase 0)

A vocabulary data file containing ~500 IELTS Academic words is present in the project workspace. Its exact format (JSON / CSV / XLSX / TS) and column names must be **inspected, never assumed**.

**Required steps:**

1. Locate the file and dump a representative sample (first 10 and last 10 rows).
2. Document the actual schema in `docs/DATA_REPORT.md`: every field, its type, nullability, and quirks (encoding issues, duplicated words, inconsistent Bengali spellings, mixed-case headwords, multi-word entries, phrasal items).
3. Write a one-time normalization step (build script or typed module) that produces an in-app dataset with:
   - Stable IDs (slugified headword, deduplicated).
   - The original list order preserved as `rank` (the file's ordering likely encodes importance — do not re-sort it away).
   - Bengali meanings preserved as a first-class field if present.
   - Any POS, frequency, definition, forms, or example fields mapped into `WordRecord` (see §19).
4. Validate: unique IDs, non-empty headwords, total count reported. Report duplicates and merge policy (case-insensitive merge, union of fields) in the data report.
5. Compute dataset stats for the Roadmap: total words, distribution across any frequency/tier fields.

**Hard rules:** If the file is missing or unparseable, STOP and report — do not fabricate a dataset. Do not "top up" the word list. The 500 real words are the product.

---

## 4. Dictionary API Integration

**Endpoint:**
`GET https://www.jumpinto.com/api/v1/assessment/ielts/vocab/vocabulary/search?sword={WORD}`
(URL-encode the word; the API appears to accept uppercase headwords — uppercase the query param; verify against a live call during Phase 5.)

**Expected raw shape (verify against a live response; normalize defensively):**

```jsonc
{
  "data": {
    "defs": [{
      "word": "LUCKY",
      "freq_level": 3,
      "forms": ["luckily", "luck", "luckier"],
      "definition": [{
        "def": "<may contain HTML> fortunate...",
        "pos": "adjective",
        "examples": [ /* string OR {sentence, source} — inspect and handle both */ ]
      }]
    }],
    "examples": [{ "sentence": "...", "source": "IELTS Reading: Topic" }]
  }
}
```

**Service requirements (`DictionaryService`):**

- **Normalization:** Strip all HTML from every `def`, `sentence`, and example string using `DOMParser` (create a detached div, read `textContent`), then decode entities, trim whitespace, collapse doubled spaces. Merge duplicate definitions keyed on `(pos, normalizedDef)`. Truncate nothing silently — mark sentences > 300 chars as ineligible for dictation but usable for reading.
- **Request behavior:** 8-second timeout via `AbortController`; one automatic retry with backoff; then mark the word as `fetch-failed` (retryable via UI affordance).
- **Duplicate prevention:** Maintain an in-flight promise map so concurrent requests for the same word share one network call.
- **Caching:** Two layers — an in-memory `Map` plus a persisted IndexedDB cache keyed by lowercase word with `fetchedAt`. TTL 30 days (dictionary data is stable). Serve cached entries instantly (stale-while-revalidate: show cache, refresh in background).
- **CORS reality:** Cross-origin calls from localhost may fail. Treat network/CORS errors identically: API marked unavailable, non-blocking dismissible banner ("Enriched dictionary data is offline — studying continues normally"), and a documented Vite dev proxy (`server.proxy`) option in the README for development.
- **Loading states:** Skeleton loaders on enriched sections; core word data from the local dataset renders immediately — enrichment never blocks a session.
- **Offline fallback:** If the API is unreachable or a word returns empty `defs`, the word remains fully learnable using local data (see the degradation matrix in §22).
- **Session isolation:** The session runner never calls the API. Enrichment happens only on Word Detail pages, IELTS Context pages, and background prefetch of tomorrow's words.

---

## 5. Learning Science System — Principles Translated into Features

Every principle below must appear as a concrete mechanism. Do not name-drop terms in the UI; implement them silently.

| Principle | Concrete product feature |
|---|---|
| **Retrieval practice** | ~95% of session time is answering, never re-reading. Passive display exists only in the "Meet" introduction stage. |
| **Spaced repetition** | Per-dimension review scheduler (§9). A correct MCQ raises *recognition* strength with weight 0.55 and schedules only the recognition dimension; a correct free-recall answer uses weight 1.0 and schedules the recall dimension on a stronger ladder. Recognition success can never satisfy a recall due date. |
| **Interleaving** | Sessions mix activity types; no two consecutive items share an activity type or the same word (except deliberate lagged retries). Confusion drills interleave confusable pairs in alternating rapid questions. |
| **Desirable difficulty** | Engine targets a rolling session success rate of 80–85%. Below 70%, inject easier items (fewer distractors, more hints); above 92%, inject harder items (production tasks, no hints). |
| **Generation effect** | Typed and constructed answers (free recall, dictation, spelling assembly, sentence writing) carry higher evidence weight than selection. |
| **Dual coding** | The "Meet" stage always pairs the written word with audio and IPA; context activities pair audio with the highlighted sentence. |
| **Contextual encoding** | Cloze and dictation items are built from the word's *own* authentic IELTS example sentences (from the API or local data), with source attribution displayed. |
| **Contrastive learning** | Confusion pairs get side-by-side comparison cards (definitions, Bengali, collocations, one signature distinction) followed by interleaved discrimination questions (§14). |
| **Error-based learning** | Errors are data: every miss is classified (wrong choice, near-miss spelling, timeout, overconfident miss), logged, and drives (a) a lagged in-session retry 3–6 items later, and (b) targeted hints tailored to the learner's actual error pattern. |
| **Forgetting curve** | Predicted retention `R = exp(−Δt / S)` per word (§6). Review queue is ordered by forgetting risk, and at-risk words surface on the Today page. |
| **Metacognition & calibration** | Before free-recall and production answers, the learner optionally reports confidence (`sure / shaky / unsure`). The system tracks whether their confidence matches reality and surfaces calibration insights (§21). Overconfident misses apply an extra strength penalty (×0.85). |
| **Progressive exposure** | New words enter via a 5-stage introduction ladder (§8), a daily new-word budget (default 8, max 15), and a cap on simultaneously-active words (default 90) to prevent overload. |
| **Semantic association** | Word families (`forms[]`), topic clustering, and related-word links on Word Detail. |
| **Recognition-to-production progression** | The mastery stage ladder (§6) and activity unlock rules (§7): production activities only unlock after recall prerequisites are met. |
| **Scaffolding removal** | Bengali meaning display policy: `on-demand` (default — tap to reveal, forcing a retrieval attempt first), `always`, or `fade` (auto-hides as recall strength rises). |
| **Cognitive load management** | Single-focus full-screen session UI; session length capped (default 15 items, ~12 minutes); no visible backlog of undone work anywhere on the home screen. |
| **Delayed recall** | Every session ends with a recheck of items missed during it; the first unsupported free-recall test occurs ≥ 24 hours after introduction, never in the introduction session. |

---

## 6. Adaptive Mastery Model

Replace any notion of `learned: boolean` with the following model.

**Nine skill dimensions per word:**

| Dimension | Meaning | Trained by |
|---|---|---|
| `recognition` | Seeing the word → knowing its meaning | MCQ word→meaning, reverse MCQ |
| `recall` | Meaning → producing the word | Cued recall, free recall |
| `context` | Understanding the word inside a sentence | Cloze, passage tasks |
| `listening` | Hearing the word → identifying it | Listen-and-choose, dictation |
| `spelling` | Producing correct letter sequence | Spelling Lab ladder, dictation |
| `forms` | Word family transformations | Form-transform tasks |
| `collocation` | Natural usage partners | Collocation selection |
| `production` | Generating original sentences | Sentence production tasks |
| `writing` | Academic writing deployment | Writing Studio (§13) |

**Signals (not dimensions):** confidence reports, response time, hints used, audio replays — each modifies how strongly an event updates state.

**Per-dimension state (see `DimensionState`, §19):** `strength` (0–100), `streak`, `lapses`, `attempts/successes`, `lastReviewedAt`, `nextDueAt`, `lastIntervalDays`.

**Deterministic update rules (implement exactly):**

- Evidence weight per activity: `meet` = 0 (seeds state only) · `mcq-word-meaning` = 0.55 · `mcq-meaning-word` = 0.60 · `listen-meaning`/`listen-spelling` = 0.70 · `cued-recall` = 0.75 · `spelling-build` = 0.70 · `context-cloze` = 0.80 · `collocation-select` = 0.80 · `form-transform` = 0.80 · `free-recall` = 1.00 · `sentence-dictation` = 1.00 · `discrimination` = 0.80 · `sentence-production` = 1.15 · `writing-task` = 0.90 (1.10 if AI-verified).
- **Success:** `Δstrength = w × (100 − strength) × 0.30 × timeModifier × hintModifier`.
  - `timeModifier`: expected response per activity (MCQ 6s, typing 12s, sentence 60s); `clamp(expected/actual, 0.7, 1.15)` — fast correct answers earn more.
  - `hintModifier`: any hint used (revealed letters, revealed Bengali under on-demand policy) → ×0.7.
- **Failure:** `strength = floor(strength × 0.55)`; `streak = 0`; `lapses += 1`; reschedule per §9.
- **Fuzzy grading for typed recall:** if the typed answer's Levenshtein distance to the target is ≤ 1 (≤ 2 for words ≥ 6 letters), grade it as *recall correct + spelling lapse*: update `recall` as success, log a `spelling` failure event with the typed string (this feeds the Spelling Lab error profile).
- **Cross-dimension credit:** success in a harder dimension partially credits easier ones (factor 0.5): `recall→recognition`, `recall→context`, `production→recall`, `writing→production`, `listening→recognition`, `spelling→recognition`, `collocation→context`, `context→recognition`. Failure never propagates.

**Forgetting risk (derived, displayed):** stability `S = lastIntervalDays × (0.6 + strength/250)` (min 0.5 days); predicted retention `R = exp(−ΔtDays / S)`; risk `= 1 − R`. A word is *at-risk* if `R < 0.6` or overdue by > 1 day.

**Overall mastery score:** weighted mean — recognition .08, context .10, listening .13, spelling .13, recall .18, forms .05, collocation .08, production .15, writing .10.

**Mastery stage ladder (recognition-to-production progression):**

- 0 `New` — never encountered
- 1 `Introduced` — Meet stage completed
- 2 `Recognized` — recognition ≥ 60 and context ≥ 40
- 3 `Active` — recall ≥ 50, listening ≥ 40, spelling ≥ 40
- 4 `Expressive` — production ≥ 50 and collocation ≥ 50
- 5 `Mastered` — overall ≥ 85, recall ≥ 80, spelling ≥ 75, production ≥ 70, longest confirmed interval ≥ 21 days, and zero lapses in the last two attempts of every core dimension

Mastered words drop to maintenance mode (intervals 64–90 days); any lapse demotes to stage 4 and reschedules.

---

## 7. Adaptive Session Algorithm

The session builder is a pure, deterministic function: `buildSession(state, now, settings) → SessionPlan`. Same state + clock + seed → identical plan (seed persisted in settings; distractor choice uses seeded RNG only).

**Candidate pools (computed each session):**

1. **Due reviews:** items with `nextDueAt ≤ now`, sorted by urgency `(1 − R) × overdueDaysWeight`.
2. **New words:** if today's introduced count < `dailyNewTarget` AND active pool (stages 1–4) < `maxActiveWords`, take the next un-introduced words by `rank`.
3. **Weak safety-net:** lowest-strength due dimensions (strength < 40), capped at 20% of the session — catches decay the schedule hasn't flagged yet.
4. **Confusion pairs:** edges with weight ≥ 2 (§14), 1–2 discrimination items per session when present.
5. **Warm-up:** one high-confidence due item (R > 0.9) at session start.

**Composition (default 15 items, configurable 10–25):** ~50% due reviews · ~20% new/stage-ladder · ~15% weak/at-risk · ~10% confusion · ~5% warm-up, subject to these hard constraints:

- No word appears twice except deliberate lagged retries, placed 3–6 positions after its failure (massed repetition guard).
- No two consecutive items share an activity type.
- **Activity selection per item = the word's weakest *due* dimension** mapped through the unlock rules: production only if recall ≥ 30; dictation only if the word has a valid example sentence; discrimination only for flagged pairs; listening/spelling items only after the word is `Introduced`.
- **Difficulty calibration:** track rolling success rate over the last 40 items; target 80–85%. Below 70% → 3-option MCQs, more hints, easier activity variants; above 92% → 5-option MCQs, hint removal, production tasks.
- **Distractor selection (MCQ):** prefer, in order — registered confusion partners → same-stage same-POS words → words with similar Bengali meanings → random same-stage words. 4 options default.

**In-session failure loop:** a failed item is re-queued 3–6 items later as an easier variant (e.g., free recall → cued recall); a second failure moves it to the session-closing review list, due again tomorrow.

**Explainability (mandatory UI feature):** every item carries `reason: { kind, humanText }` rendered as a subtle line under the prompt — e.g., "Due for recall review — you recalled this correctly 3 days ago," "Weak in listening — 2 recent misses," "New word — Stage 3," "Confusion pair: *affect / effect*." A "Why this word?" affordance on every item.

**Session completion screen:** accuracy, words strengthened, words to see again tomorrow, tomorrow's projected load, elapsed time. Ending a session early is always allowed and never loses committed events.

---

## 8. Word Introduction Flow (Exposure Ladder)

Never test a word the learner has never met, and never dump a dictionary entry on first contact. Each new word moves through:

- **Stage 0 — Meet (same session as introduction):** a full introduction card: headword in display serif, IPA, POS, audio button (auto-play once), the single clearest definition, Bengali meaning (per display policy), one highlighted authentic example sentence, and the word-family strip (`forms`). A "Word family" glance and a "Got it" acknowledgment. No test.
- **Stage 1 (later in the same session, ≥ 5 items later):** MCQ word → meaning (recognition).
- **Stage 2 (end of same session):** MCQ meaning → word (reverse recognition).
- **Stage 3 (next session, ≥ 24h):** cued recall + listening MCQ.
- **Stage 4 (≥ 48h later):** spelling dictation + context cloze.
- The word then enters the normal adaptive flow.

Rules: never more than 8 first-time meetings per session; the Meet card is skippable (visual scan → acknowledge) but never testable-first; if the learner opens the app after > 3 days away, no new words are introduced that day — the session is 100% review (re-entry protocol, preventing the "I left and now it's hopeless" abandonment spiral).

---

## 9. Review and Spaced Repetition Scheduler

Per-dimension scheduling, deterministic:

- **Interval ladder:** `[1, 2, 4, 8, 16, 32, 64]` days, indexed by the dimension's consecutive success `streak`, then scaled: `nextIntervalDays = LADDER[min(streak, 6)] × (0.5 + strength/200)`, capped at 90 days.
- **On lapse:** due in 10 minutes if a session is active (in-session retry), else next session; after a successful retry, next due = +1 day.
- **Recognition vs recall, enforced structurally:** each dimension owns its own `nextDueAt`. Recognition successes only extend the recognition ladder. The session's "review" pool is driven primarily by recall/context/listening/spelling dues — never satisfiable by recognition answers alone. This is the core anti-illusion-of-competence mechanism.
- **Maintenance:** stage-5 words get sparse long-interval checks across rotating dimensions.
- **Clock skew guard:** if `now < lastReviewedAt`, clamp to `lastReviewedAt` (user turned back their clock).

The scheduler lives in `src/core/engine/` as pure functions with unit tests proving: identical inputs produce identical plans; recognition-only success never clears a recall due; lapses shorten intervals; mastery stage transitions fire exactly at thresholds.

---

## 10. Listening Lab

A dedicated practice space plus integrated session items. Audio via the **Web Speech API** (`speechSynthesis`) wrapped in a `SpeechService` (see §18) — no external audio files.

**Activity set:**

1. **Word → meaning:** hear the word, choose its meaning.
2. **Word → spelling:** hear the word, choose the correct spelling from 4 near-identical options (targets phonological decoding).
3. **Minimal-pair discrimination:** play one of two similar-sounding words (drawn from the learner's confusion pairs and phonetically similar words — e.g., same ending, similar vowels); learner identifies which was spoken.
4. **Sentence dictation:** play the word's authentic example sentence at 0.75× / 0.9× / 1.0× speed; the learner types the target word (advanced optional setting: type the full sentence).
5. **Listen-while-read:** audio + highlighted sentence shown together for dual-coding reinforcement (low-stakes, available in Meet and Word Detail).

**Behavior details:** unlimited replays but *replays are logged* (> 2 replays marks weak listening encoding and feeds the weak pool); speed toggle persists per learner; a voice picker in Settings with preview buttons; voice preference order en-GB → en-AU → en-US (IELTS listening is predominantly British/Australian).

**Speech service robustness:** handle Chrome's asynchronous voice loading (`voiceschanged` event); require a user gesture before the first utterance on iOS Safari (prime the engine on the first tap); detect zero available voices and disable listening activities for the session with a clear non-blocking notice; catch utterance `onerror` and surface a retry control — never a silent failure or a frozen "playing" state.

---

## 11. Spelling Lab

A progressive per-word ladder, ordered by the word's spelling strength:

1. **Syllable-chunk reorder:** assemble the word from shuffled syllable chunks.
2. **Letter-bank assembly:** tap/click letters in order from a scrambled bank.
3. **Type with hint:** type the word given meaning + first two letters + length.
4. **Flash-and-type:** the word flashes for ~1.5s, learner types it from memory.
5. **Audio dictation:** hear the word (no visual), type it.
6. **Meaning → spelling:** see the meaning (Bengali per policy + English gloss), type the word — full production.

**Error pattern engine (error-based learning):** for every typed attempt, align the input against the target (Levenshtein) and classify the error: dropped double letter, vowel substitution, silent-letter omission, suffix/inflection error, transposition, truncation. Store counts in the word's `errorProfile` and aggregate a learner-level profile ("You drop double letters 3× more than average — words: *commission, occur, necessary*"). Future hints for that word highlight the learner's *actual* error class (e.g., if they drop the double "m" in *commission*, the hint shows "commi**mm**ention" style emphasis), not generic hints.

**Input hygiene:** spelling inputs must set `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `autoComplete="off"` — otherwise mobile keyboards defeat the exercise.

---

## 12. IELTS Context Engine

Goal: words are learned inside the register and topics they'll actually appear in.

- **Topic map:** build a topic index by parsing `source` labels from API examples (e.g., "IELTS Reading: Environment") and any topic fields in the local dataset. Words lacking topic data are grouped by stage.
- **Topic pages:** "Words in Environmental Science passages" — the word cluster, shared example sentences with sources, and a topic-level mixed quiz.
- **Authentic cloze:** the primary context activity uses the word's own example sentence with the target blanked. Validation before use: the sentence must contain the word or one of its `forms` (case-insensitive); sentences failing this check are reading-only. Distractors for cloze are drawn from same-topic words.
- **Passage recall:** show 3 authentic sentences from one topic, then ask which target words appeared (delayed recall + context binding).
- **Academic register exposure:** source labels are always displayed with examples ("From an IELTS Reading passage on urban planning") — subtle, constant register framing.
- **Collocation extraction (deterministic, offline):** derive candidate collocates from co-occurrence in the word's example sentences and definition text (content words adjacent to or near the target form), filtered by a stopword list. These power collocation-select activities. No external NLP dependency.

---

## 13. Writing Integration (Writing Studio)

The bridge from "knows the word" to "uses the word in an essay."

**Task types:**

1. **Guided frames:** sentence frames with collocation slots — "The findings ____ significant implications for…" with a word bank.
2. **Register transformation:** an informal sentence is shown; rewrite it using the target word in academic register ("The weather got way worse" → "The situation ____ considerably").
3. **Free production:** write 1–2 original sentences using the word.
4. **Contrastive self-evaluation (the core no-AI mechanism):** after submitting, the learner's sentence appears **side-by-side with 2–3 authentic API example sentences** using the same word, followed by a 4-point self-rubric: correct word form · natural collocation · academic register · meaning preserved. Self-ratings update the `writing` dimension at evidence weight 0.90.
5. **Optional AI feedback module:** behind a `WritingFeedbackProvider` interface. Default implementation is a `NullProvider` (the app is fully functional without it). If a provider is configured (e.g., an LLM adapter with a user-supplied key), it grades against the same rubric at weight 1.10. The adapter is a separate module — never imported by the core engine.

**Use-it-or-lose-it tracking:** words that reached `production ≥ 50` but have no writing event in 14 days are flagged and injected into Writing Studio prompts.

---

## 14. Confusion Detection

**Signals that create confusion edges (word A ↔ word B):**

- MCQ wrong answer: target A, chosen B → edge +1.
- Near-miss typing: Levenshtein ≤ 2 between typed answer and a *different* known word → edge +1.
- Long hesitation (> 2× expected response time) followed by an error → edge +0.5.
- Shared Bengali meaning or same POS + same stage → weak prior edge (0.25), only activated by a real event.

**Graph & drills:** store `ConfusionEdge { a, b, weight, resolvedStreak }`. When `weight ≥ 2`, schedule a **Discrimination Drill**: (1) side-by-side comparison card — both words with definitions, Bengali, one authentic example each, their key collocations, and a composed "signature distinction" line auto-generated from their differing definitions; (2) interleaved rapid-fire block alternating questions about the pair (which word fits this gap? which word did you hear? spell the one that means X). Three consecutive correct discriminations decay the edge by half.

The Discrimination Trainer page lists top confusion pairs with weights and drill history.

---

## 15. 500-Word Roadmap

Make 500 words feel like a journey, not a wall.

- **Structure:** 10 stages × 50 words, ordered by the dataset's `rank` (and frequency data when available). Stage names are descriptive, not cute: "Stage 1 · Core Academic Foundation (words 1–50)" with a dominant-topic subtitle when topic data exists.
- **Unlock gate:** the next stage unlocks at ≥ 80% of the current stage at mastery stage ≥ 3 (`Active`). Reviews continue cumulatively from all unlocked stages — no stage is ever "done and discarded."
- **Checkpoints:** each completed stage offers a mixed checkpoint quiz (30 items across all dimensions from that stage's words). Passing (≥ 85%) seals the stage with a typographic milestone ("Stage 3 sealed — 150 words encountered, 118 active"). Failing produces a targeted re-review plan for the missed words — framed as information, never punishment.
- **Psychological design:** the Roadmap page shows stages as a vertical progression with progress rings and a per-stage word grid colored by mastery level (6-step legend from New to Mastered). The **Today page never shows the 493 unfinished words** — only "8 new + 14 reviews ≈ 12 minutes today."
- **Pace projection:** computed honestly from the trailing 7-day rate of new-word introductions: "At your current pace: all 500 words in active memory by 12 March." If pace is zero, show a gentle re-entry prompt, not guilt copy.
- **Milestones:** quiet typographic moments at 50 / 100 / 250 / 500 — full-screen, one line of copy, one number, "Continue" button. No confetti.

---

## 16. UX/UI Design System

**Aesthetic direction:** *a fine dictionary publisher's digital study companion* — calm, scholarly, premium. Think warm paper, ink, one confident accent color. It must never read as a gamified education app.

**Color tokens (Tailwind config):**

- Surface: warm off-white `#FAF9F6` (light), deep ink `#141A22` (optional dark mode).
- Text: ink `#1C2430` primary, muted slate secondary.
- Accent: deep teal `#0F766E` — used sparingly: primary CTA, active states, focus, links.
- Semantic: correct `#15803D` (green), incorrect `#BE123C` (rose), warning amber. Never rely on color alone — pair with icons and text.
- Word-mastery spectrum: a 6-step neutral-to-deep-teal scale for word grids.

**Typography:**

- UI: Inter (or system stack), 15–16px base, comfortable 1.6 line-height.
- **Headword display:** a refined serif (Fraunces or Newsreader via `fontsource`), large (clamp 32–56px) — the word itself is the hero of every screen.
- **Bengali script:** Noto Sans Bengali, sized +1 step above Latin equivalents with tuned line-height; ensure correct rendering in all mixed-script strings.
- IPA in muted monospace or serif italic beneath headwords.

**Interaction model:**

- Keyboard-first: `1–4` select MCQ options · `Enter` submit/advance · `Space` replay audio (prevent default scroll) · `?` show word info. Focus management moves to the active control after every transition.
- Feedback micro-interactions: 150–250ms ease-out. Correct: soft border-color shift + check icon. Incorrect: gentle 4px horizontal shake (disabled under `prefers-reduced-motion`), then the correct answer is *revealed and must be acknowledged* (Enter/click) before advancing — no speed-past errors.
- Session mode is full-screen and chrome-free with a slim progress indicator (dots or a thin bar), an exit affordance, and persistent "progress is saved" reassurance.
- No modal dialogs over learning content. No blocking loading states during sessions.

**Motion restraint (policy):** no confetti, no coin sounds, no streak flames, no mascot. Motion exists only to explain state changes.

**Accessibility (hard requirements):** AA contrast everywhere; full keyboard operability including a complete session run; `aria-live` announcements for correct/incorrect feedback and audio instructions; labeled audio controls; ≥ 44px touch targets; `prefers-reduced-motion` honored; screen-reader labels on all icon buttons.

**Responsive:** mobile-first. Session inputs must never be covered by the mobile keyboard (scroll-into-view on focus). Bottom tab bar (5 items + More sheet) on mobile; persistent left rail on desktop (Today · Learn · Review · Roadmap · Labs · Writing · Insights · Library · Settings).

**Microcopy tone:** adult, calm, factual, quietly encouraging. "Good — that one's getting solid." / "Not yet. Here it is again." / "18 reviews are overdue — memory fades; let's catch up." Never "Yay! 🎉" Never shame, never urgency theater.

---

## 17. Required Pages

Every page must define its loading, empty, and error states.

1. **Onboarding** (first run, ≤ 90 seconds, 4 steps): goal confirmation, daily time budget → item count mapping, Bengali display policy, voice test (plays a sample word; detects speech availability). Ends with a 3-line explanation of the method ("This is not a flashcard app. Every word is tracked across meaning, recall, listening, spelling, and usage…") — trust-building, skippable.
2. **Today (home):** greeting, today's plan summary ("8 new words · 14 reviews · ~12 min"), one primary CTA ("Begin session"), secondary entries to Labs, at-risk warning if reviews are > 2 days overdue, quiet stats strip (words in active memory, current stage). Nothing else. This page embodies "show only the next useful action."
3. **Session Runner:** full-screen activity player implementing all activity types, the state machine `loading-plan → stimulus → response → feedback → transition → complete`, reasons, confidence prompts, lagged retries, resume support (persisted plan + index; offer to resume after interruption).
4. **Roadmap:** stage progression, per-stage rings, word grids with mastery legend, checkpoint entry, pace projection.
5. **Library (Browse):** search-as-you-type, filters (stage, topic, POS, mastery state, at-risk), virtualized list → Word Detail. Local data renders instantly; API enrichment loads on open.
6. **Word Detail:** the complete word workspace — headword hero with audio + IPA, Bengali (per policy), definitions (enriched), forms strip, authentic examples with sources, mastery panel (per-dimension strength bars with last-reviewed and next-due, stage, history), confusion links, error profile, "Practice this word now" (injects a focused mini-session).
7. **Review Hub:** due counts by type (all / recall / listening / spelling / at-risk), start targeted review sessions.
8. **Listening Lab:** activity set from §10, with speed and voice controls.
9. **Spelling Lab:** ladder from §11, plus the learner's error-pattern profile.
10. **Discrimination Trainer:** confusion pair list, drills, resolution history.
11. **Writing Studio:** tasks from §13, use-it-or-lose-it queue, self-rubric flow, optional provider status.
12. **Progress & Insights:** §21 analytics.
13. **Settings:** daily budget, session length, Bengali policy, voice picker with previews, speech rate, theme, data export/import/reset, API status.

---

## 18. Technical Architecture

**Stack (prescribed):** Vite · React 18+ · TypeScript (strict) · TailwindCSS · React Router v6 (lazy routes) · Zustand (store) · Vitest (+ React Testing Library) · `idb-keyval`-style minimal IndexedDB wrapper. No heavy UI frameworks — hand-built components keep the design distinct.

**Folder structure:**

```
src/
  app/            # router, providers, layout shells
  core/engine/    # PURE TypeScript: scheduler, mastery updates, confusion,
                  # session builder, projections, fuzzy grading, error profiles
  services/       # DictionaryService, SpeechService, PersistenceService,
                  # interfaces + implementations (DI-ready)
  store/          # Zustand slices: progress, session, settings
  features/       # session/, roadmap/, library/, word-detail/, listening/,
                  # spelling/, discrimination/, writing/, insights/, settings/
  components/ui/  # Button, Card, ProgressBar, SegmentedControl, Skeleton...
  data/           # normalized vocabulary dataset + manifest (from Phase 0)
  types/          # shared domain types (§19)
  utils/          # text/levenshtein, time, seeded rng, html-strip
```

**Data flow (one-way, strict):** UI dispatch → store action → pure engine function `(state, event, now) → newState` → store update → persistence subscriber (debounced 500ms + flush on `visibilitychange`/`beforeunload`). The engine never imports React. React never computes scheduling.

**Session Runner:** a hand-rolled explicit reducer state machine (states: `loading-plan`, `stimulus`, `response`, `feedback`, `transition`, `session-complete`; events: `submit`, `acknowledge`, `retry`, `skip`, `exit`). All 15+ activity components implement one shared `ActivityProps` interface so the runner is activity-agnostic.

**SpeechService interface:** `init()` (gesture-primed), `getVoices(): Promise<Voice[]>` (handles `voiceschanged`), `speak(text, { voiceURI?, rate }): Promise<SpeechResult>` with cancel, error events, and a test-mode mock. Never call `speechSynthesis` directly from components.

**PersistenceService:** async adapter interface; `LocalStorageAdapter` for settings + progress state; IndexedDB for the dictionary cache and event log. Export/import JSON with schema versioning and a `migrate()` hook.

**Performance:** virtualized Library list; lazy route chunks; memoized dataset lookups (Map by id); engine work in plain functions outside the React render path; no re-render cascades during sessions (the runner subscribes only to the current item).

**Quality gates:** `tsc --strict` clean, ESLint with `no-explicit-any` as an error, all engine functions unit-tested, README covering setup, the dev proxy for the dictionary API, and the test suite.

---

## 19. Data Models and TypeScript Interfaces

Implement exactly these domain contracts in `src/types/` (extend as the real dataset requires, document deviations):

```ts
type DimensionKey =
  | 'recognition' | 'recall' | 'context' | 'listening' | 'spelling'
  | 'forms' | 'collocation' | 'production' | 'writing';

type ActivityType =
  | 'meet' | 'mcq-word-meaning' | 'mcq-meaning-word' | 'listen-meaning'
  | 'listen-spelling' | 'minimal-pair' | 'cued-recall' | 'free-recall'
  | 'spelling-build' | 'flash-type' | 'sentence-dictation' | 'context-cloze'
  | 'collocation-select' | 'form-transform' | 'sentence-production'
  | 'discrimination' | 'writing-task';

interface WordRecord {
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
}

interface DictionaryEntry {      // normalized API response (HTML stripped)
  word: string; fetchedAt: number;
  defs: { word: string; freqLevel?: number; forms: string[];
          definitions: { def: string; pos?: string;
                         examples: { sentence: string; source?: string }[] }[] }[];
  examples: { sentence: string; source?: string }[];
}

interface DimensionState {
  strength: number;              // 0–100
  streak: number; lapses: number; attempts: number; successes: number;
  lastReviewedAt: number; nextDueAt: number; lastIntervalDays: number;
}

interface WordProgress {
  wordId: string; introducedAt: number;
  masteryStage: 0 | 1 | 2 | 3 | 4 | 5;
  dimensions: Record<DimensionKey, DimensionState>;
  firstExposureModality: ActivityType | null;
  errorProfile: Record<string, number>;
  updatedAt: number;
}

interface LearningEvent {
  id: string; sessionId: string; wordId: string;
  activity: ActivityType; dimension: DimensionKey;
  correct: boolean; responseMs: number;
  confidence?: 'sure' | 'shaky' | 'unsure';
  hintsUsed: number; audioReplays: number;
  detail?: { typed?: string; chosenOption?: string; target?: string };
  timestamp: number;
}

type ReasonKind = 'new-introduction' | 'due-review' | 'weak-dimension'
  | 'confusion-pair' | 'in-session-retry' | 'maintenance' | 'warm-up';

interface SessionItem {
  wordId: string; activity: ActivityType; dimension: DimensionKey;
  difficulty: 1 | 2 | 3;
  reason: { kind: ReasonKind; humanText: string };
}

interface SessionPlan { id: string; createdAt: number; seed: number; items: SessionItem[]; }

interface ConfusionEdge { a: string; b: string; weight: number; lastAt: number; resolvedStreak: number; }

interface UserSettings {
  dailyNewTarget: number;        // default 8, clamp 4–15
  maxActiveWords: number;        // default 90
  sessionLengthTarget: number;   // default 15
  bengaliPolicy: 'always' | 'on-demand' | 'fade';
  preferredVoiceURI?: string;
  speechRate: 0.75 | 0.9 | 1;
  theme: 'light' | 'dark';
  seed: number;
}

interface DailyLog {
  date: string;                  // 'YYYY-MM-DD'
  newWordsIntroduced: number; itemsAnswered: number; itemsCorrect: number;
  activeMinutes: number;
  dimensionsTrained: Partial<Record<DimensionKey, number>>;
}
```

`RawVocabRow` (the file's actual shape) must be defined during Phase 0 from real inspection, alongside a documented mapper to `WordRecord`.

---

## 20. Persistence and Offline Support

- **Progress is precious.** Every `LearningEvent` commits immediately (debounced 500ms, plus forced flush on `visibilitychange` and `beforeunload`). A refresh mid-session never loses committed items; an interrupted session is resumable (plan + cursor persisted).
- **Storage layout:** `localStorage` — progress state + settings (namespaced, versioned keys like `lexis:progress:v1`); IndexedDB — dictionary cache and rolling event log. On quota errors: prune the dictionary cache first, then compact events older than 30 days into `DailyLog` aggregates, then notify the user — never silently drop progress.
- **Offline-first:** with the network fully disabled, all of the following must work: sessions (all activities that don't require enrichment), both Labs, Writing Studio (self-rubric mode), Roadmap, Library, Insights, export/import. API-dependent sections degrade per §22.
- **Export/Import:** one-click JSON download containing everything needed to restore on another device (versioned, validated on import, with a confirm dialog for destructive merges).
- **Reset:** full, explicit, double-confirmed.

---

## 21. Analytics (Progress & Insights)

Track meaningful learning metrics only — no vanity statistics (no "total XP," no "cards flipped"). All numbers computed from the event log; if a metric has insufficient data (n < 20), render "Collecting data…" rather than a fabricated value.

**Insight cards:**

1. **Retention forecast:** "In 7 days you'll likely remember ~74% of your active words" (count of words with predicted R ≥ 0.8).
2. **Mastery distribution:** histogram of stages 0–5; counts of New / Recognized / Active / Expressive / Mastered / At-risk.
3. **Success rate by activity type:** the data behind "which learning method works best for you."
4. **First-exposure modality effect:** compares 7-day recall success grouped by how the word was first introduced — surfaces e.g., "Words you first met through listening are retained 22% better." Only shown when both groups have n ≥ 20.
5. **Confidence calibration:** per-level actual success rates — "When you say 'sure,' you're right 87% of the time." Flags systematic overconfidence per dimension.
6. **Spelling error profile:** top error patterns with affected words (§11).
7. **Confusion hotspots:** top 5 pairs by weight with drill links.
8. **Pace & projection:** 7-day rolling new-words/day, projected completion date.
9. **Honest time investment:** total active minutes (from session durations), subtle 30-day activity calendar.

---

## 22. Error Handling — Degradation Matrix

Robust behavior is a first-class feature. Handle all of the following explicitly:

| Situation | Behavior |
|---|---|
| API unreachable / CORS / timeout ×2 | Mark API unavailable; dismissible banner; local data only; studying continues |
| API success but `defs` empty or malformed | "No enriched data for this word yet" note; Word Detail falls back to local fields |
| Definition arrays empty / nested examples malformed | Skip enriched sections; never render empty blocks or `undefined` |
| Word has no valid example sentence | Disable cloze/dictation/context/dictation activities for it (validated: sentence must contain the word or a form); the word remains fully learnable via meaning, recall, spelling, listening-word, and writing tasks |
| `speechSynthesis` missing or zero voices | Disable listening items for the session; clear notice in Listening Lab and Settings; session auto-replans without listening items |
| Utterance `onerror` mid-activity | Retry control + visual fallback; never a stuck "playing" state |
| Storage quota exceeded | Prune cache → compact old events → notify; never drop progress |
| Clock skew (`now < lastReviewedAt`) | Clamp to `lastReviewedAt` |
| Double-click / double-submit | Idempotent event commit (one event per item interaction) |
| Dataset load failure | Full-screen hard-error state with guidance; never an empty app |

---

## 23. Implementation Phases

Build in this order. Each phase ends with a working, verifiable increment.

**Phase 0 — Data Inspection & Normalization (gate: `docs/DATA_REPORT.md` exists; validation passes; normalized dataset module + manifest committed).** Inspect the real file (§3); define `RawVocabRow`; build the mapper and stats; report anomalies. If anything contradicts this spec's assumptions, adapt the mapper — not the data.

**Phase 1 — Foundation.** Vite + TS strict + Tailwind tokens + typography (including Noto Sans Bengali), routing with layouts, all domain types, PersistenceService + LocalStorage/IndexedDB adapters, Zustand store slices, Settings page, Onboarding flow.

**Phase 2 — Learning Engine (gate: full unit-test suite green).** Pure functions: mastery updates (all formulas from §6), scheduler (§9), session builder with reasons and constraints (§7), confusion graph (§14), fuzzy grading, error classification, projections (§15, §21), seeded RNG. Vitest tests proving determinism, the recognition-vs-recall separation, threshold transitions, and lapse behavior.

**Phase 3 — Core Loop.** Session Runner state machine, all activity components, Meet/introduction ladder, confidence prompts, lagged retries, session-complete summary, resume support, Today dashboard wired to real engine output.

**Phase 4 — Structure.** Roadmap with stages/gates/checkpoints, Library with search/filters/virtualization, Word Detail with mastery panel, Review Hub.

**Phase 5 — Enrichment & Audio.** DictionaryService (normalization, caching, coalescing, timeouts, offline fallback, dev proxy), IndexedDB cache, SpeechService (voice selection, rates, gesture priming, error handling), enrichment UI with skeletons, background prefetch of tomorrow's words.

**Phase 6 — Labs & Studio.** Listening Lab (all §10 activities), Spelling Lab (ladder + error-pattern engine + tailored hints), Discrimination Trainer, Writing Studio (frames, transformations, self-rubric, contrastive comparison, `WritingFeedbackProvider` interface with NullProvider default).

**Phase 7 — Insights, Data Safety, Resilience.** All §21 analytics computed from the event log; export/import/reset; offline airplane-mode test; every degradation row of §22 implemented and manually verified.

**Phase 8 — Polish & QA.** Full keyboard-only session run; screen-reader pass on the session runner; `prefers-reduced-motion`; mobile keyboard overlap fixes; Lighthouse accessibility ≥ 90 and performance ≥ 90 on the session and Today pages; final copy pass in the calm microcopy tone; README.

---

## 24. Acceptance Criteria — Definition of "Complete"

The build is complete only when all of the following are verifiably true:

1. All ~500 real words from the supplied file load, browse, search, and are learnable end-to-end. Zero invented words.
2. With the network disabled, a full study session (introductions, MCQ, cued/free recall, spelling, listening, cloze where local data allows) completes successfully.
3. Refreshing mid-session loses zero committed answers; the interrupted session is offered for resume.
4. The engine is provably deterministic: a unit test asserting identical `(state, now, seed) → identical plan` passes.
5. A unit test proves a recognition-only success never clears a recall due date.
6. Word Detail displays per-dimension strength, last review, next due, and the current mastery stage with the §6 thresholds applied exactly.
7. Every session item displays a human-readable reason for its selection.
8. All 15+ activity types are implemented and reachable through the adaptive engine; none are dead code.
9. Mastery requires the full stage-5 rubric; a single correct answer visibly does not mark any word learned.
10. Confusion edges created by real errors spawn discrimination drills; three correct discriminations decay the edge.
11. Audio works on Chrome, Edge, and Safari; missing voices degrade gracefully.
12. Spelling inputs defeat mobile autocorrect/spellcheck (attributes verified).
13. Export → wipe → import restores complete progress.
14. `tsc` strict passes with zero errors; ESLint `no-explicit-any` is enforced as an error; the engine test suite passes.
15. A keyboard-only user can complete an entire session, and a screen-reader user receives correct/incorrect feedback via `aria-live`.
16. The visual result matches the calm-premium design direction: no confetti, no streak flames, no mascot, no dark patterns.

---

## 25. Anti-Patterns — Explicitly Prohibited

Do **not** build any of the following. If you find yourself doing so, stop and re-read the relevant section.

1. A flashcard flip interaction as the core mechanic. (The core is retrieval across nine dimensions.)
2. A boolean `learned`/`known` field, or an "I know this word" button that marks mastery. (Confidence self-reports are signals, never state-setters.)
3. Random quiz generation. (Every item is selected by the adaptive engine with a logged reason.)
4. A home screen that lists or counts all 500 outstanding words. (Today's slice only.)
5. Recognition successes clearing recall schedules, or any single-dimension success advancing another dimension's due date without a defined implication edge.
6. Massed repetition: showing the same word back-to-back, or testing a word seconds after its introduction.
7. Requiring the dictionary API (or any AI API) to study. Enrichment and AI are layers, never dependencies.
8. Losing progress on refresh, tab switch, or app close.
9. `any` types, mock word lists, placeholder definitions standing in for the real dataset, or fake analytics numbers.
10. Gamification noise: coins, XP, leaderboards, confetti, mascots, loss-aversion streaks, notification nagging.
11. Unexplained intelligence: any scheduling or difficulty change the learner can't see a reason for.
12. Blocking modals over learning content; forced session completion; un-skippable flows.
13. Vanity statistics (cards viewed, total clicks) presented as progress.
14. Silent failures: stuck audio, empty example blocks, `undefined` rendered in the UI, swallowed API errors.
15. Bengali meanings shown by default before every retrieval attempt (this destroys the generation effect — the default policy is on-demand).
16. A visual prototype: every button, setting, filter, lab, and page must function against real state.

---

**Final directive:** When you finish, the product should feel like a patient, precise coach sitting beside a serious IELTS candidate — one that remembers everything the learner does, forgets nothing, explains itself, and quietly gets them from word #1 to word #500 with genuine, demonstrable mastery. Build exactly that.