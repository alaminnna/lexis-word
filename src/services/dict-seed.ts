// Local seed-cache loader (offline enrichment fallback).
// Bulk-loads dict-seed/*.json (see scripts/fetch-dict-seed.mjs, deployed as
// static files alongside the app) into the IndexedDB dictionary cache through
// the normal normalization path.

import { WORDS } from '../data/words';
import { idb } from './idb';
import { normalizeEntry } from './dictionary';

/** Base-aware URL so seed files load under any base path (Vercel, subpaths). */
function seedUrl(file: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}dict-seed/${encodeURIComponent(file)}.json`;
}

export async function hasSeedFiles(): Promise<boolean> {
  try {
    const res = await fetch(seedUrl('achieve'));
    return res.ok;
  } catch {
    return false;
  }
}

export interface SeedProgress {
  done: number;
  total: number;
  errors: number;
}

/** Load every seed file; missing/corrupt files are skipped, never fatal. */
export async function seedDictionaryCache(
  onProgress?: (p: SeedProgress) => void,
): Promise<SeedProgress> {
  let done = 0;
  let errors = 0;
  const total = WORDS.length;
  for (const w of WORDS) {
    const key = w.word.toLowerCase();
    try {
      const res = await fetch(seedUrl(key));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as Parameters<typeof normalizeEntry>[1];
      const entry = normalizeEntry(w.word, raw, Date.now());
      await idb.set('dict', key, { entry, fetchedAt: Date.now() });
    } catch {
      errors++;
    }
    done++;
    if (done % 25 === 0 || done === total) {
      onProgress?.({ done, total, errors });
      await new Promise((r) => setTimeout(r, 0)); // let progress paint
    }
  }
  return { done, total, errors };
}
