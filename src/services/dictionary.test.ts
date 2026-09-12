import { describe, expect, it, vi, afterEach } from 'vitest';
import { dictionary, isDictationEligible, normalizeEntry, stripHtml } from './dictionary';

/** Trimmed live response (verified 2026-09-11 against the real endpoint). */
const LIVE = {
  code: 2000,
  message: 'OK',
  data: {
    defs: [{
      word: 'achieve',
      freq_level: 'Very Common',
      freq_level_num: 4,
      forms: ['achieves', 'achieving', 'achieved'],
      linked: [],
      definition: [{
        def: 'If you <span class="dict-word-in-sentence">achieve</span> a particular aim, you succeed in doing it.',
        pos: 'verb',
        examples: ['There are many who will work hard to achieve these goals. [VERB noun]'],
      }],
    }],
    examples: [
      { sentence: 'Greater efforts must be made to <span class="dict-word-in-sentence">achieve</span> a modal shift.', source: 'Academic 10 Test 1 Reading Task 2' },
      'A bare string example without source.',
    ],
  },
};

describe('dictionary normalization (live shape)', () => {
  it('normalizes the verified live response', () => {
    const entry = normalizeEntry('achieve', LIVE, 1000);
    expect(entry).not.toBeNull();
    expect(entry!.defs).toHaveLength(1);
    expect(entry!.defs[0]!.freqLevel).toBe(4); // from freq_level_num (freq_level is a label)
    expect(entry!.defs[0]!.forms).toEqual(['achieves', 'achieving', 'achieved']);
    const def = entry!.defs[0]!.definitions[0]!;
    expect(def.pos).toBe('verb');
    expect(def.def).not.toContain('<span');
    expect(def.def).toContain('achieve');
    expect(def.examples).toHaveLength(1);
    expect(entry!.examples).toHaveLength(2);
    expect(entry!.examples[0]).toMatchObject({ source: 'Academic 10 Test 1 Reading Task 2' });
    expect(entry!.examples[1]).toMatchObject({ sentence: 'A bare string example without source.' });
  });

  it('returns null for empty or malformed payloads', () => {
    expect(normalizeEntry('x', {}, 0)).toBeNull();
    expect(normalizeEntry('x', { data: { defs: [] } }, 0)).toBeNull();
    expect(normalizeEntry('x', { data: { defs: [{ definition: [{ def: '   ' }] }] } }, 0)).toBeNull();
  });

  it('keeps examples even when defs are empty (live so-called shape)', () => {
    const entry = normalizeEntry('so-called', {
      data: { defs: [], examples: [{ sentence: 'The <span>so-called</span> expert spoke.', source: 'Academic 5 Test 1' }] },
    }, 0);
    expect(entry).not.toBeNull();
    expect(entry!.defs).toEqual([]);
    expect(entry!.examples).toHaveLength(1);
  });

  it('strips HTML without a browser quirk', () => {
    expect(stripHtml('a <b>bold</b>  word')).toBe('a bold word');
  });

  it('marks >300-char sentences dictation-ineligible', () => {
    expect(isDictationEligible('short.')).toBe(true);
    expect(isDictationEligible('x'.repeat(301))).toBe(false);
  });
});

describe('retry policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails fast on 403 (policy block) without retrying', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('forbidden', { status: 403 })));
    vi.stubGlobal('fetch', fetch);
    const r = await dictionary.lookup('zz-no-retry-403');
    expect(r.source).toBe('failed');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once on 500, then fails', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('err', { status: 500 })));
    vi.stubGlobal('fetch', fetch);
    const r = await dictionary.lookup('zz-retry-500');
    expect(r.source).toBe('failed');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('serves a successful response from network', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(LIVE), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const r = await dictionary.lookup('zz-success-live');
    expect(r.source).toBe('network');
    expect(r.entry?.defs[0]?.freqLevel).toBe(4);
  });
});
