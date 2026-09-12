# Contributing to Lexis

Small, honest contributions welcome. Bug fixes, better Bengali glosses, new
drill ideas, docs cleanup — all good.

## Setup

```sh
npm install
npm run dev      # http://localhost:5173
```

Node 20+. No env vars needed for core study.

## Before you push

```sh
npm run typecheck
npm test
npm run build
```

All three should pass. If a test fails, that's the first thing to fix —
don't work around it.

## Ground rules

- **Engine stays pure.** Anything in `src/core/engine/` must be deterministic,
  dependency-free, and covered by a test. If you change scheduling or grading,
  add or update a test that proves the behavior.
- **Same design language.** Warm paper + ink + one teal accent, Fraunces for
  headwords, Inter for UI. No new accent colors, no gradient backgrounds,
  no emoji in the UI. Check `src/index.css` tokens first.
- **44px targets.** Every tappable element stays keyboard reachable with a
  visible focus state. Test with `Tab` + `Enter` before calling it done.
- **No secrets in commits.** `.env` is gitignored for a reason — keys go in
  `.env.example` as empty placeholders only.
- **Explain the why.** PR descriptions should say what changed and why, not
  just what. One paragraph is enough.

## How to propose a change

1. Fork, branch off `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep it focused — one idea per PR.
3. Open the PR against `main` with the what + why.

No formal code of conduct file yet — be kind, assume good intent, review the
idea not the person.
