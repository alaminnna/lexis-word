// One-time dictionary cache seeder (dev enrichment workaround).
//
// WHY THIS EXISTS: the dictionary API sends no CORS headers (browsers block
// direct reads) and its Cloudflare bot management challenges Node TLS stacks
// (the Vite dev proxy gets a "Just a moment..." page). Windows curl.exe uses
// Schannel and is served normally, so this script warms a LOCAL seed cache
// that the app bulk-loads into IndexedDB (same TTL + normalization as live).
//
// POLITENESS: strictly sequential, 400ms between words, stops at the first
// non-JSON response. Re-run any time; existing files are skipped.
// USAGE: node scripts/fetch-dict-seed.mjs [--limit N] [--force]
// OUTPUT: public/dict-seed/<word>.json (gitignored — local cache, not data).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'dict-seed');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const FORCE = args.includes('--force');

const words = JSON.parse(readFileSync(join(root, 'scripts', 'words-unique.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlJson(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl.exe', ['-s', '--compressed', '--max-time', '25', '-H', 'Accept: application/json', '-w', '\n%{http_code}\n%{content_type}', url],
      { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        const lines = stdout.trimEnd().split('\n');
        const contentType = lines.pop() ?? '';
        const httpCode = lines.pop() ?? '';
        resolve({ httpCode: Number(httpCode), contentType, body: lines.join('\n') });
      },
    );
  });
}

let done = 0;
let skipped = 0;
for (const { word } of words.slice(0, LIMIT)) {
  const file = join(outDir, `${word.toLowerCase()}.json`);
  if (!FORCE && existsSync(file)) {
    skipped++;
    continue;
  }
  const url = `https://www.jumpinto.com/api/v1/assessment/ielts/vocab/vocabulary/search?sword=${encodeURIComponent(word.toUpperCase())}`;
  try {
    const { httpCode, contentType, body } = await curlJson(url);
    if (httpCode !== 200 || !contentType.includes('application/json')) {
      console.error(`STOP: ${word} → HTTP ${httpCode} ${contentType} (challenge or block?)`);
      break;
    }
    const parsed = JSON.parse(body);
    if (parsed?.code !== 2000 || !parsed?.data) {
      console.error(`STOP: ${word} → unexpected payload (code=${parsed?.code})`);
      break;
    }
    writeFileSync(file, JSON.stringify(parsed), 'utf8');
    done++;
    if (done % 25 === 0) console.log(`…${done} fetched (${word})`);
  } catch (err) {
    console.error(`STOP: ${word} → ${err.message ?? err}`);
    break;
  }
  await sleep(400);
}
console.log(`OK: ${done} fetched, ${skipped} already cached.`);
