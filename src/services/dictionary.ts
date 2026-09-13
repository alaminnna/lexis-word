// DictionaryService (§4): enriched IELTS dictionary data with defensive
// normalization, coalesced requests, two-layer caching (memory + IndexedDB,
// 30-day TTL, stale-while-revalidate), 8s timeout + one retry, and loud
// offline degradation. Enrichment never blocks learning.

import type { DictionaryEntry } from '../types/domain';
import { idb } from './idb';

const API_PATH = '/api/v1/assessment/ielts/vocab/vocabulary/search';
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 30 * 86_400_000;
const REFRESH_AFTER_MS = 7 * 86_400_000;
const DICT_STORE = 'dict';

export type ApiStatus = 'unknown' | 'available' | 'unavailable';

export interface LookupResult {
  entry: DictionaryEntry | null; // null = no enriched data (fallback to local)
  source: 'cache' | 'network' | 'failed';
  stale: boolean;
}

interface RawExample {
  sentence?: string;
  source?: string;
}
type RawExampleInput = string | RawExample;

interface RawDefinition {
  def?: string;
  pos?: string;
  examples?: RawExampleInput[];
}
interface RawDef {
  word?: string;
  freq_level?: number | string; // live API sends a label like "Very Common"
  freq_level_num?: number;      // live API sends the numeric level here
  forms?: string[];
  definition?: RawDefinition[];
  definitions?: RawDefinition[]; // accepted defensively
}
interface RawResponse {
  data?: {
    defs?: RawDef[];
    examples?: RawExampleInput[];
  };
}

/** Strip HTML with a detached div (spec §4), decode entities, normalize space. */
export function stripHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const text = doc.body.textContent || '';
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeExample(input: RawExampleInput): { sentence: string; source?: string } | null {
  if (typeof input === 'string') {
    const sentence = stripHtml(input);
    return sentence ? { sentence } : null;
  }
  if (typeof input === 'object' && typeof input.sentence === 'string') {
    const sentence = stripHtml(input.sentence);
    if (!sentence) return null;
    const out: { sentence: string; source?: string } = { sentence };
    if (typeof input.source === 'string' && input.source.trim()) out.source = input.source.trim();
    return out;
  }
  return null;
}

/** Sentences over 300 chars are reading-only, never dictation material (§4). */
export function isDictationEligible(sentence: string): boolean {
  return sentence.length <= 300;
}

function freqLevelOf(d: RawDef): number | undefined {
  if (typeof d.freq_level_num === 'number') return d.freq_level_num;
  if (typeof d.freq_level === 'number') return d.freq_level;
  return undefined;
}

export function normalizeEntry(word: string, raw: RawResponse, fetchedAt: number): DictionaryEntry | null {
  const data = raw.data;
  if (!data || !Array.isArray(data.defs)) return null;
  const defs: DictionaryEntry['defs'] = [];
  for (const d of data.defs) {
    const defList = Array.isArray(d.definition) ? d.definition : Array.isArray(d.definitions) ? d.definitions : [];
    const seen = new Set<string>();
    const definitions: DictionaryEntry['defs'][number]['definitions'] = [];
    for (const item of defList) {
      const def = typeof item.def === 'string' ? stripHtml(item.def) : '';
      if (!def) continue;
      const pos = typeof item.pos === 'string' ? item.pos.trim().toLowerCase() : undefined;
      const key = `${pos ?? ''}::${def.toLowerCase()}`;
      if (seen.has(key)) continue; // merge duplicate definitions (§4)
      seen.add(key);
      const examples: { sentence: string; source?: string }[] = [];
      if (Array.isArray(item.examples)) {
        for (const ex of item.examples) {
          const n = normalizeExample(ex);
          if (n) examples.push(n);
        }
      }
      const entry: DictionaryEntry['defs'][number]['definitions'][number] = { def, examples };
      if (pos) entry.pos = pos;
      definitions.push(entry);
    }
    if (definitions.length === 0) continue;
    defs.push({
      word: typeof d.word === 'string' && d.word ? d.word : word.toUpperCase(),
      freqLevel: freqLevelOf(d),
      forms: Array.isArray(d.forms) ? d.forms.filter((f): f is string => typeof f === 'string') : [],
      definitions,
    });
  }
  const examples: { sentence: string; source?: string }[] = [];
  if (Array.isArray(data.examples)) {
    for (const ex of data.examples) {
      const n = normalizeExample(ex);
      if (n) examples.push(n);
    }
  }
  // Edge case (seen live: "so-called"): no defs but real examples —
  // keep the examples so context activities still benefit.
  if (defs.length === 0 && examples.length === 0) return null;
  return { word: word.toLowerCase(), fetchedAt, defs, examples };
}

function endpointFor(word: string): string {
  const query = `sword=${encodeURIComponent(word.toUpperCase())}`;
  if (import.meta.env.VITE_DICT_PROXY === '1') {
    return `/api-dict${API_PATH}?${query}`;
  }
  // Production (and dev without the env flag): same-origin serverless proxy
  // (api/dict-search.ts on Vercel, vite proxy in dev). Never fetch the
  // upstream cross-origin from the browser — it sends no CORS headers, so
  // every direct call fails and the app degrades to "offline".
  return `/api/dict-search?${query}`;
}

async function fetchOnce(word: string, signal: AbortSignal): Promise<RawResponse> {
  const res = await fetch(endpointFor(word), { signal });
  if (!res.ok) throw new HttpError(`Dictionary HTTP ${res.status}`, res.status);
  return (await res.json()) as RawResponse;
}

/** HTTP failures carry their status so the retry policy can fail fast. */
export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Retryable: network/CORS errors, timeouts, 408/429/5xx. NOT 403/404 (policy). */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof HttpError)) return true;
  return err.status === 408 || err.status === 429 || err.status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CacheRecord {
  entry: DictionaryEntry | null;
  fetchedAt: number;
}

class DictionaryService {
  private memory = new Map<string, CacheRecord>();
  private inflight = new Map<string, Promise<LookupResult>>();
  private failedAt = new Map<string, number>();
  private status: ApiStatus = 'unknown';
  private listeners = new Set<(s: ApiStatus) => void>();

  getStatus(): ApiStatus {
    return this.status;
  }

  onStatusChange(listener: (s: ApiStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(s: ApiStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.listeners) l(s);
  }

  /** Words currently marked fetch-failed (retryable via UI affordance). */
  isFailed(word: string): boolean {
    return this.failedAt.has(word.toLowerCase());
  }

  /**
   * Called after a bulk local seed (scripts/fetch-dict-seed.mjs + seed UI).
   * 'available' means enrichment is servable (network OR cache) — a later
   * real network failure flips it back honestly.
   */
  noteCacheSeeded(count: number): void {
    if (count > 0) {
      this.failedAt.clear();
      this.setStatus('available');
    }
  }

  retry(word: string): Promise<LookupResult> {
    this.failedAt.delete(word.toLowerCase());
    return this.lookup(word, { refresh: true });
  }

  async lookup(word: string, opts: { refresh?: boolean } = {}): Promise<LookupResult> {
    const key = word.toLowerCase();
    const cached = this.memory.get(key) ?? (await idb.get<CacheRecord>(DICT_STORE, key).catch(() => undefined));
    if (cached) this.memory.set(key, cached);
    if (cached && !opts.refresh) {
      const age = Date.now() - cached.fetchedAt;
      if (age > REFRESH_AFTER_MS) void this.refreshInBackground(key, word);
      return { entry: cached.entry, source: 'cache', stale: age > CACHE_TTL_MS };
    }
    const ongoing = this.inflight.get(key);
    if (ongoing) return ongoing;
    const job = this.fetchAndStore(key, word);
    this.inflight.set(key, job);
    try {
      return await job;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async refreshInBackground(key: string, word: string): Promise<void> {
    if (this.inflight.has(key)) return;
    const job = this.fetchAndStore(key, word);
    this.inflight.set(key, job);
    try {
      await job;
    } catch {
      // Background refresh failures stay silent — cache continues to serve.
    } finally {
      this.inflight.delete(key);
    }
  }

  private async fetchAndStore(key: string, word: string): Promise<LookupResult> {
    const fetchedAt = Date.now();
    try {
      const raw = await this.fetchWithRetry(word);
      const entry = normalizeEntry(word, raw, fetchedAt);
      const record: CacheRecord = { entry, fetchedAt };
      this.memory.set(key, record);
      void idb.set(DICT_STORE, key, record).catch(() => undefined);
      this.failedAt.delete(key);
      this.setStatus('available');
      return { entry, source: 'network', stale: false };
    } catch {
      this.failedAt.set(key, Date.now());
      this.setStatus('unavailable');
      return { entry: null, source: 'failed', stale: false };
    }
  }

  private async fetchWithRetry(word: string): Promise<RawResponse> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) await sleep(800);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        return await fetchOnce(word, controller.signal);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err)) break; // 403/404: retrying a policy block is pointless
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Dictionary request failed.');
  }

  /** Prefetch enrichment for upcoming words (idle-time, best-effort). */
  prefetch(words: string[]): void {
    // No point hammering a dead endpoint: skip background work entirely while
    // the API is marked unavailable (user-initiated lookups still try).
    if (this.status === 'unavailable') return;
    const run = async (): Promise<void> => {
      let consecutiveFailures = 0;
      for (const w of words.slice(0, 12)) {
        const key = w.toLowerCase();
        if (this.memory.has(key) || this.inflight.has(key)) continue;
        const result = await this.lookup(w);
        if (result.source === 'failed') {
          consecutiveFailures++;
          // Circuit breaker: 3 straight failures (CORS/offline never heal
          // mid-loop) — stop flooding the console and the network.
          if (consecutiveFailures >= 3) break;
        } else {
          consecutiveFailures = 0;
        }
      }
    };
    const ric = (window as unknown as Record<string, unknown>).requestIdleCallback;
    if (typeof ric === 'function') {
      (ric as (cb: () => void) => void)(() => void run());
    } else {
      setTimeout(() => void run(), 5000);
    }
  }
}

export const dictionary: DictionaryService = new DictionaryService();
export type { DictionaryService };
