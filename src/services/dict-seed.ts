// Local seed-cache loader (dev enrichment workaround).
// Bulk-loads public/dict-seed/*.json (see scripts/fetch-dict-seed.mjs) into the
// IndexedDB dictionary cache through the normal normalization path.

import { WORDS } from '../data/words';
import { idb } from './idb';
import { normalizeEntry } from './dictionary';

export async function hasSeedFiles(): Promise<boolean> {
  try {
    const res = await fetch('/dict-seed/achieve.json');
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
      const res = await fetch(`/dict-seed/${encodeURIComponent(key)}.json`);
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
