import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = readFileSync(join(root, 'word.md'), 'utf8');

// Split into `## List N` sections. Tables may follow a list header directly or
// appear after another table without an explicit header (the file omits some
// "## List N" headings) — sequential tables belong to sequential lists.
const lines = raw.split(/\r?\n/);
const lists = []; // { index, tableHtml[] }
let current = null;
for (const line of lines) {
  const h = line.match(/^##\s+List\s+(\d+)\s*$/i);
  if (h) {
    current = { index: Number(h[1]), tables: [] };
    lists.push(current);
    continue;
  }
  if (line.includes('<table')) {
    if (!current) {
      current = { index: lists.length + 1, tables: [] };
      lists.push(current);
    }
    current.tables.push(line.trim());
  }
}

const HEADER_RE = /^Words\s*\d+-\d+$/i;

function parseTable(html) {
  // A table contains one or two labelled blocks: header row "Words 1-10 … Words 41-50"
  // followed by 10 body rows (column-major: header cell N marks column N), then
  // optionally a second header row "Words 51-60 …" with 10 more rows.
  const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td>(.*?)<\/td>/g)].map((c) => c[1].trim())
  );
  const blocks = [];
  let block = null;
  for (const row of rows) {
    if (row.length === 5 && row.every((c) => HEADER_RE.test(c))) {
      block = { start: Number(row[0].match(/(\d+)/)[1]), columns: [] };
      blocks.push(block);
      continue;
    }
    if (block && row.length === 5) block.columns.push(row);
  }
  // Column-major readout: for each block, words 1..10 are the first column
  // top-to-bottom (matching the "Words 1-10" header), then the next column, etc.
  const words = [];
  for (const b of blocks) {
    for (let col = 0; col < 5; col++) {
      for (let r = 0; r < b.columns.length; r++) {
        const w = b.columns[r][col];
        if (w) words.push(w);
      }
    }
  }
  return words;
}

const allWords = []; // { word, list, orderInList }
let tableSeq = 0;
for (const list of lists) {
  for (const t of list.tables) {
    tableSeq++;
    const words = parseTable(t);
    words.forEach((w) => allWords.push({ word: w, list: tableSeq }));
  }
}

// Normalize headwords: trim, collapse spaces, lowercase for keying; keep display form.
const seen = new Map();
const unique = [];
const duplicates = [];
for (let i = 0; i < allWords.length; i++) {
  const display = allWords[i].word.replace(/\s+/g, ' ').trim();
  const key = display.toLowerCase();
  if (seen.has(key)) {
    duplicates.push({ word: display, keptRank: seen.get(key), droppedFileOrder: i });
    continue;
  }
  seen.set(key, unique.length);
  unique.push({ display, key, fileOrder: i, list: allWords[i].list });
}

const report = {
  listsFound: lists.map((l) => ({ index: l.index, tables: l.tables.length })),
  totalCells: allWords.length,
  uniqueWords: unique.length,
  duplicates,
  quirks: {
    multiWord: unique.filter((u) => u.display.includes(' ')).map((u) => u.display),
    hyphenated: unique.filter((u) => u.display.includes('-')).map((u) => u.display),
    mixedCase: unique.filter((u) => u.display !== u.display.toLowerCase()).map((u) => u.display),
    nonAlpha: unique.filter((u) => /[^a-z\s-]/i.test(u.display)).map((u) => u.display),
    tableCount: tableSeq,
  },
};
writeFileSync(join(root, 'scripts', 'parse-report.json'), JSON.stringify(report, null, 2));
writeFileSync(
  join(root, 'scripts', 'words-raw.json'),
  JSON.stringify(unique.map((u, i) => ({ word: u.display, rank: i + 1, list: u.list })), null, 1)
);
console.log(JSON.stringify({ lists: report.listsFound, totalCells: report.totalCells, unique: report.uniqueWords, duplicateCount: duplicates.length }, null, 2));
console.log('first10:', unique.slice(0, 10).map((u) => u.display).join(', '));
console.log('last10:', unique.slice(-10).map((u) => u.display).join(', '));
console.log('duplicates:', duplicates.map((d) => d.word).join(', ') || '(none)');
