# Lexis — IELTS Academic vocabulary, the calm way

I'm building Lexis because most vocab apps test recognition and call it learning.
You tap "I know this" on a flashcard and feel productive. Then the word shows up
in a listening test and it's gone.

Lexis tracks what you actually know about each word — meaning, recall, spelling,
listening, and more — across 9 separate dimensions, and tells you *why* it's
showing you each item. No streaks, no mascots, no confetti. Just a quiet place
to learn 499 IELTS Academic words properly.

Built for Bengali-speaking candidates, works for anyone. Fully offline.

## What it does

- **Today** — opens with a daily plan, not a blank screen. Due reviews first,
  new words after.
- **Learn** — meet new words through short guided sessions. Every item carries
  a human-readable reason ("weak recall on *achieve*, last missed 2 days ago").
- **Review** — spaced repetition per dimension. Recognition success can never
  satisfy a recall due date — that's enforced structurally, with a test proving it.
- **Roadmap** — 10 stages from first meeting to mastery, so progress feels real.
- **Library** — all 499 words with Bengali glosses, forms, and example sentences.
- **Labs** — dedicated practice rooms:
  - *Listening Lab* — word → meaning, minimal pairs, sentence dictation.
  - *Spelling Lab* — a six-rung ladder (chunks → letters → hinted typing →
    flash typing → dictation → meaning → spell) that auto-matches your weakest
    words and profiles your actual error patterns (doubled letters, silent
    letters, suffix slips…).
  - *Discrimination Trainer* — side-by-side drills for word pairs you keep mixing up.
- **Writing Studio** — write academic sentences with your words. Grades itself
  with a 4-point rubric out of the box; optional AI grading if you add a key.
- **Insights** — where your errors actually go. Spelling slips, confusion pairs,
  weak dimensions.

## Quickstart

```sh
npm install
npm run dev      # http://localhost:5173
```

Node 20+ required. No environment variables needed for core study — everything
runs locally from day one.

```sh
npm test         # engine + UI suite (vitest, 115 tests)
npm run typecheck
npm run lint
npm run build    # production build to dist/
```

## How it works

**Memory model** (`src/core/engine/`) — per-word, per-dimension strength (0–100),
streaks, lapses, review schedules. Deterministic and explainable; no black boxes.

**Session builder** — a pure function, `buildSession(state, now, settings)`.
Due reviews, introduction ladder, weak safety-net, confusion drills, warm-up.
No repeated activity types back-to-back, reason attached to every item.

**Data** — `word.md` holds the 499 headwords in priority order, with companion
Bengali glosses in `src/data/glosses/`. Regenerate with `npm run data:parse`,
validate with `npm run data:glosses`. Details in `docs/DATA_REPORT.md`.

**Persistence** — progress and settings live in versioned localStorage
(debounced, flushed on tab hide/close); dictionary cache in IndexedDB.
Export / import / reset from Settings. Refresh mid-session and you lose nothing;
interrupted sessions offer resume.

## Optional extras (both degrade gracefully)

**Dictionary enrichment** — Word Detail pages can enrich from an online
dictionary API. Cross-origin calls from localhost usually fail on CORS; the app
shows a dismissible banner and carries on with local data. For reliable dev
enrichment there's a one-click offline seed cache — see the README section in
Settings → Dictionary enrichment. Seed files stay local (gitignored).

**AI writing feedback** — Writing Studio accepts multiple API entries
(base URL + model + key each), tried top-to-bottom with automatic fallback to
self-review when keys are missing or rejected. Needs `VITE_AI_PROXY=1` in dev
(see `.env.example` — never commit real keys). Client-side keys ship in the JS
bundle, so treat them as low-trust and rotate if abused.

## Project map

| Area | Location |
|---|---|
| Domain contracts | `src/types/domain.ts` |
| Learning engine (pure, tested) | `src/core/engine/` |
| Services (dictionary, speech, persistence, sound) | `src/services/` |
| State (Zustand slices + selectors) | `src/store/` |
| Session runner + 17 activity types | `src/features/session/` |
| Pages (Today, Roadmap, Library, Labs, Writing, Insights…) | `src/features/` |
| UI kit (tokens, icons, controls) | `src/components/ui/` + `src/index.css` |
| Vocabulary dataset (generated, committed) | `src/data/words.ts` |

## Design notes

Warm paper + ink + one deep-teal accent. Fraunces serif for headwords, Inter
for UI, Noto Sans Bengali one step larger. Motion is 200ms state transitions
that respect `prefers-reduced-motion`. Full keyboard operation: `1–5` for
options, `Enter` to submit, `Space` to replay audio. Sound and haptics are
synthesized in-browser (no files) with toggles in Settings.

## Honest limitations

- **No IPA field.** Neither the dataset nor the dictionary API shape provides
  phonetics, so pronunciation is audio-only (Web Speech API). `WordRecord.ipa`
  is ready for when a source exists.
- **Topic grouping** is a documented keyword heuristic until better example
  sources arrive; stage grouping is the fallback.
- **Advanced dictation** (type the full sentence) lives in the Listening Lab
  only; sessions use target-word dictation.
- **First-exposure insight** derives modality from the earliest logged event
  per word.

Still working on it — the next version is already in progress.

## About

Built by **Al A Min (Alaminnna)** — Dhaka, Bangladesh.
I build in the open: small tools, honest progress, no hype.

- Website: https://alaminnna.ami.bd
- GitHub: https://github.com/alaminnna
- LinkedIn: https://www.linkedin.com/in/alaminnna/
