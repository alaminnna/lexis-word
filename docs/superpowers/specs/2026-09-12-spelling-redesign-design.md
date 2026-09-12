# Spelling Lab Responsive Redesign — 2026-09-12

Same Lexis style locked. No new theme, no new libs.

## Goal
`/labs/spelling` works great on PC and phone, same calm editorial style (Fraunces + Inter, paper/ink/teal in `src/index.css`).

## Current pain (`src/features/labs/SpellingPage.tsx`)
- Single `max-w-3xl` column, cramped on PC.
- Ladder = wrapping `SegmentedControl` buttons, no 6-rung feel.
- Practice Card + error Card stacked, disconnected.
- No queue, weak tally, Check/Next scroll away on phone.

## Decision: Editorial Split (A)
- PC `lg:`: 3-col `240px | 1fr | 280px` — ladder nav | stage | insights rail.
- Phone: sticky horizontal stepper top + stage + stacked insights + sticky Next bar.
- Logic unchanged: `useLabRound('spelling')`, `weakestSpelling()`, `stepFor()`, same 6 activities.

## Layout
- `src/app/layout.tsx`: container `max-w-3xl lg:max-w-6xl` (mobile same, PC wider).
- SpellingPage:
  - Breadcrumb `← Labs`, `PageHeader` with `tabular-nums` tally `correct/total`.
  - `LadderNav`: `radiogroup`, vertical on `lg` (number, name, threshold hint, desc), horizontal `overflow-x-auto snap-x` on mobile, `min-h-[48px]` targets, `aria-checked` + `aria-current`.
  - Stage `Card`: `p-5 lg:p-8`, assembly tray `min-h-[72px]`, tiles `min-h-[52px] min-w-[48px]`, `active:scale-[0.98]`, `animate-shake` on wrong, Check `w-full sm:w-auto`.
  - Insights rail `lg:sticky lg:top-4`: current word meta (length, strength, rung), `TailoredTip`, error patterns top-4 with counts + example words, weakest-5 queue (tap to jump).
  - Next button: `w-full sm:w-auto`, `sticky bottom-[76px] md:static` on phone above tab bar.

## Same style
- Tokens only: `bg-paper`, `border-line`, `text-ink-soft`, `bg-accent-soft`, `text-accent-deep`, `bg-warn-soft`, `transition-calm`.
- No gradients, no new fonts, no new deps. `text-wrap:balance` headers, global focus ring kept.

## Data / errors / testing
- Data flow same, no engine change. Queue tap = `jumpToWord(id)` sets index then `lab.start()`.
- Empty pool → existing `EmptyState`. Feedback phase → existing activity feedback + Next.
- Verify: `npm run typecheck`, `npm run test`, `npm run build`. Manual: 390px + 1280px, keyboard Tab/Enter, dark mode.
