# Lexis — IELTS Academic Vocabulary Mastery

An adaptive, evidence-informed vocabulary coach for Bengali-speaking IELTS Academic
candidates. Not a flashcard app: every word carries a persistent 9-dimension memory
model, every session item carries a human-readable reason, and every interaction
updates state through a deterministic, explainable engine. No AI API required.

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine + UI test suite (vitest)
npm run typecheck  # tsc --strict
npm run lint       # eslint (no-explicit-any is an error)
npm run build      # production build to dist/
```

Node 20+ required. No environment variables needed for core study.

## How it works

- **Memory model** (`src/core/engine/`): per-word, per-dimension strength (0–100),
  streaks, lapses, and per-dimension review schedules. Recognition success can never
  satisfy a recall due date — enforced structurally, with a unit test proving it.
- **Session builder**: pure deterministic `buildSession(state, now, settings)` —
  due reviews, introduction ladder, weak safety-net, confusion drills, warm-up —
  with reasons on every item and no repeated activity types back-to-back.
- **Data**: `word.md` (499 real headwords in priority order) + companion study
  glosses (`src/data/glosses/`). See `docs/DATA_REPORT.md`. Regenerate with
  `npm run data:parse` and validate with `npm run data:glosses`.
- **Persistence**: progress + settings in versioned localStorage (debounced 500ms,
  flushed on tab hide/close); dictionary cache in IndexedDB. Export/import/reset in
  Settings. A refresh mid-session loses nothing; interrupted sessions offer resume.

## Dictionary enrichment (optional)

Word Detail pages enrich from:

```http
GET https://www.jumpinto.com/api/v1/assessment/ielts/vocab/vocabulary/search?sword={WORD}
```

Cross-origin calls from localhost usually fail (CORS) — that is expected and handled:
a dismissible banner appears and studying continues on local data.

**Reliable dev enrichment (recommended): local seed cache.** The API sits behind
Cloudflare bot management, which also blocks the Vite dev proxy's TLS fingerprint
(verified: browsers/curl get JSON, Node gets challenged, repeat hits get 403).
So warm the cache once with any TLS stack that passes (Windows curl works):

```sh
node scripts/fetch-dict-seed.mjs   # polite: sequential, 400ms gaps, stops on block
```

then open the app → **Settings → Dictionary enrichment → Load seed cache**
(dev-only button). All 499 words load into IndexedDB through the normal
normalization path (same 30-day TTL). After that, enrichment serves with zero
network calls. Seed files live in `public/dict-seed/` (gitignored, local only).

**Best-effort alternative: dev proxy.** `VITE_DICT_PROXY=1` (already in `.env`)
routes `/api-dict/*` → the API origin. It works only where Cloudflare tolerates
the proxy's fingerprint — if you see 403s, use the seed path above.

The live shape was verified on 2026-09-11 (see `src/services/dictionary.test.ts`):
`freq_level` is a label ("Very Common") with the numeric level in
`freq_level_num`; definitions and examples carry HTML spans (stripped); examples
are strings or `{sentence, source}` with real IELTS sources
("Academic 10 Test 1 …").

## Optional AI writing feedback

Writing Studio grades with a 4-point self-rubric by default (fully functional).
For AI grading it uses an **ordered API pool** (`https://api.cline.bot/api/v1`
by default, OpenAI-compatible chat completions, model `z-ai/glm-5.3-flash`):

- Open Writing Studio → **AI feedback** → **+ Add API** for api1, api2, api3…
  each entry has its own base URL, model, and keys. Entries are tried
  top-to-bottom (↑↓ reorder) on every grade — a capped or rejected API is
  skipped automatically. An entry without keys falls back to the built-in
  system keys (`VITE_LEXIS_SYSTEM_KEYS` in `.env`, comma-separated), which
  rotate on daily limits with automatic cooldowns.
- **Test** button per entry validates base URL + model + key live. The model
  picker reads the live `/models` catalogue (free-first ordering, 7-day cache).
- The app asks for keys **only** when saved ones get rejected (401) — rejected
  entries are flagged inline and grading falls back to self-review.
- Browsers can't call gateways directly (no CORS headers): set
  `VITE_AI_PROXY=1` and restart `npm run dev` so calls go same-origin through
  the `/api-cline` dev proxy.

AI-graded writing commits at evidence weight 1.10; any other failure degrades to
self-review, never a block. A legacy custom-endpoint adapter is also available.
See `src/services/writing-feedback.ts`.

> Client-side keys ship inside the JS bundle — treat the system keys as
> low-trust/shareable and rotate them if a quota is abused.

## Project map

| Area | Location |
|---|---|
| Domain contracts (§19) | `src/types/domain.ts` |
| Learning engine (pure, tested) | `src/core/engine/` |
| Services (dictionary, speech, persistence, IDB) | `src/services/` |
| State (Zustand slices + selectors) | `src/store/` |
| Session runner + 17 activity types | `src/features/session/` |
| Pages (Today, Roadmap, Library, Labs, Writing, Insights…) | `src/features/` |
| UI kit (tokens, icons, controls) | `src/components/ui/` + `src/index.css` |
| Vocabulary dataset (generated, committed) | `src/data/words.ts` |

## Design notes

Calm, premium, adult: warm paper + ink + one deep-teal accent, Fraunces display
serif for headwords, Inter for UI, Noto Sans Bengali sized +1 step. No confetti,
coins, streaks, or mascots. Motion is limited to 200ms state-change transitions
(and honors `prefers-reduced-motion`). Full keyboard operation: `1–5` options,
`Enter` submit/advance, `Space` replay audio, focus moves with the task.

## Sound & haptics

Answers play soft synthesized chimes (Web Audio API — no files, fully offline)
and gentle vibration patterns (`navigator.vibration` where supported: Android/
Chrome; iOS Safari has no web vibration API and degrades silently). Everything
is controlled from **Settings → Sound & haptics**: master toggles, volume,
theme (Chime / Pulse), per-event switches (correct / wrong / complete / button
taps), haptic intensity, and previews. Haptics pause automatically under
`prefers-reduced-motion`. Services: `src/services/sound.ts`,
`src/services/haptics.ts`, orchestrated by `src/services/feedback.ts`.

## Known limitations (honest)

- **No IPA field**: neither the dataset nor the verified API shape provides
  phonetics, so pronunciation is audio-only (Web Speech API). `WordRecord.ipa`
  can be added when a source exists.
- **Topic grouping** is a documented keyword heuristic (`src/core/topics.ts`) until
  API example sources arrive; stage grouping is the fallback, per spec.
- **Advanced dictation** (type the full sentence) lives in the Listening Lab only;
  sessions use target-word dictation.
- **First-exposure insight** derives modality from the earliest logged event per
  word (introductions are uniformly Meet cards).
