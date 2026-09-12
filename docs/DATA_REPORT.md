# Lexis Data Report — `word.md` inspection & normalization

Generated from: `scripts/parse-vocab.mjs` → `scripts/parse-report.json` + `scripts/words-raw.json`
+ `scripts/words-unique.json`. Re-run with `npm run data:parse`.

## 1. File format (inspected, not assumed)

- `word.md` is a Markdown document whose vocabulary payload is **5 HTML `<table>` elements**
  (one per line), each holding **100 headword cells**.
- Section headings `## List N` exist only for lists **1, 2 and 4**. The headings for
  **List 3 and List 5 are missing** from the file; tables were assigned to sequential
  lists 1–5 by table order (each table is self-labelled "Words 1–10 … 91–100").
- Each table contains **two labelled blocks**: a header row
  `Words 1-10 | Words 11-20 | Words 21-30 | Words 31-40 | Words 41-50` followed by 10 body
  rows, then a second header row `Words 51-60 … 91–100` with 10 more body rows.
  **Readout order is column-major**: "Words 1-10" = first column top-to-bottom.
  The parser (`parseTable`) implements exactly this and was verified against the labels
  (e.g. List 1 starts achieve, administration, affect, … — the well-known AWL head order).

## 2. Schema of the real dataset

| Field | Type | Notes |
|---|---|---|
| headword | string | the only data column; plain lowercase English words |
| list | 1–5 (derived) | sequential table number, 100 words per table |
| orderInList | 1–100 (derived) | column-major position inside the table |

**Absent fields:** Bengali meanings, POS, frequency/freq_level, definitions, word forms,
example sentences, topics/sources. Every one of those columns is missing — the file
carries headwords and (implicit) priority order only.

## 3. Quirks

- **Total cells: 500. Unique headwords: 499.**
- **Duplicate:** `global` appears twice — List 1 word 47 (kept, rank 47) and again in the
  List 3 first block (dropped). **Merge policy: case-insensitive first-occurrence wins**;
  the single kept record preserves the earliest rank. No fields were unioned because the
  file carries no per-word fields to union.
- **Hyphenated:** exactly one entry — `so-called` (rank 487). Slug: `so-called`.
- **Multi-word entries:** none. **Mixed case:** none. **Non-alpha characters:** none
  (beyond the hyphen above). **Encoding issues:** none (UTF-8 clean).
- Ordering within columns is the file's priority order and is preserved verbatim as
  `rank` 1–499 in `src/data/words.ts`.

## 4. Normalized in-app dataset

- `src/data/words.ts` (auto-generated, committed): `WordRecord[]` with
  `id` (slugified headword), `word`, `rank` (1–499, file order), `stage`
  (`floor((rank-1)/50)` → 10 roadmap stages × 50 words; stage 9 holds 49),
  plus companion gloss fields (see §5).
- `RawVocabRow` (`src/types/domain.ts`): `{ word: string; list: number }` — the file's
  actual shape, defined from inspection.

## 5. Companion study glosses (documented deviation from §3)

§3 assumes the file may carry Bengali/POS/definition/forms/example fields ("if present").
None are present, yet offline-first learning (§0.14, acceptance criterion 2) requires
every word to be learnable with the network disabled — MCQ options need meanings,
recall prompts need glosses, cloze/dictation need sentences.

Resolution (mapper adapted, data untouched — per §23 Phase 0 rule):

- The 499 real headwords were **not invented, replaced, re-sorted, or topped up**.
- A companion layer `src/data/glosses/part-{1..5}.json` adds, per headword:
  `pos` (primary), `def` (concise English gloss), `bengali` (standard Bengali equivalent
  in Bengali script), `forms` (real inflections/derivations only, `[]` when none exist),
  `sentence` (one neutral study example, 6–24 words, validated to contain the word or a
  form). These sentences are **study examples, never attributed to IELTS passages** —
  the UI renders them without source framing; API examples keep their source labels.
- `scripts/merge-glosses.mjs` (`npm run data:glosses`) validates coverage (every dataset
  word exactly once, in order, no invented words), POS enum, definition/sentence
  lengths, Bengali-script presence, forms hygiene, and sentence↔word containment, then
  emits `src/data/words.ts`. It currently passes on all 499 records.

## 6. Dataset stats for the Roadmap

- Total learnable words: **499** (spec's "~500").
- Stages: 10 × 50 (stage 10: ranks 451–499, 49 words).
- No frequency/tier fields exist in the file, so stage order = file order (rank).
- Topics: none in the file; topic clustering derives from API example `source` labels
  at runtime (§12), falling back to stage grouping.
