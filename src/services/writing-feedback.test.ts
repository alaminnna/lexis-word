import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  AllKeysRejectedError, CustomEndpointProvider, MultiApiProvider, NullProvider,
  OpenAICompatProvider, TokenExpiredError, defaultAIConfig, effectiveBaseUrl,
  fetchAIModels, isFreeModel, loadProviderConfig, nextApiName, readModelCache,
  resetKeyCooldowns, resolveAIProvider, saveProviderConfig, testOpenAIToken, writeModelCache,
} from './writing-feedback';

function chatReply(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

const GOOD_JSON = JSON.stringify({
  scores: { form: true, collocation: true, register: false, meaning: true },
  comment: 'Watch the register.',
});

describe('writing feedback providers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEY', '');
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEYS', '');
    resetKeyCooldowns();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('null provider degrades to self-review', async () => {
    const fb = await new NullProvider().grade('achieve', 'We achieve things.');
    expect(fb.aiVerified).toBe(false);
  });

  it('grades via OpenAI-compatible chat, parsing plain and fenced JSON', async () => {
    let gotUrl = '';
    const fetch = vi.fn((url: string) => {
      gotUrl = url;
      return Promise.resolve(chatReply(GOOD_JSON));
    });
    vi.stubGlobal('fetch', fetch);
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1/', model: 'm:free', apiKey: 'k' });
    const fb = await p.grade('achieve', 'We achieve things.');
    expect(fb.aiVerified).toBe(true);
    expect(fb.scores).toEqual({ form: true, collocation: true, register: false, meaning: true });
    expect(fb.comment).toBe('Watch the register.');
    // trailing slash tolerated in base URL
    expect(gotUrl).toBe('https://x.test/v1/chat/completions');

    const fenced = vi.fn(() => Promise.resolve(chatReply(`\`\`\`json\n${GOOD_JSON}\n\`\`\``)));
    vi.stubGlobal('fetch', fenced);
    const fb2 = await p.grade('achieve', 'We achieve things.');
    expect(fb2.scores.form).toBe(true);
  });

  it('throws TokenExpiredError on 401/403', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 401 }))));
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1', model: 'm:free', apiKey: 'bad' });
    await expect(p.grade('achieve', 'x')).rejects.toBeInstanceOf(TokenExpiredError);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 403 }))));
    await expect(p.grade('achieve', 'x')).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('throws a generic error on 500 (caller falls back to self-review)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('boom', { status: 500 }))));
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1', model: 'm:free', apiKey: 'k' });
    await expect(p.grade('achieve', 'x')).rejects.toThrow('AI: HTTP 500');
  });

  it('rotates to the next system key on daily-limit 429', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { headers?: Record<string, string> }) => {
      const auth = init?.headers?.Authorization ?? '';
      calls.push(auth);
      if (auth === 'Bearer sk-one') {
        return Promise.resolve(new Response(
          JSON.stringify({ error: { code: 'INFERENCE_CAP_ERROR', message: 'Error 429: Daily free limit reached. Try again in 3h 4m' } }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ));
      }
      return Promise.resolve(chatReply(GOOD_JSON));
    }));
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1', model: 'm', apiKeys: ['sk-one', 'sk-two'] });
    const fb = await p.grade('achieve', 'We achieve things.');
    expect(fb.aiVerified).toBe(true);
    expect(calls).toEqual(['Bearer sk-one', 'Bearer sk-two']);
  });

  it('skips cooling-down keys and surfaces the last cap message when all are spent', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'Error 429: Daily free limit reached. Try again in 1h 0m' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }),
    )));
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1', model: 'm', apiKeys: ['sk-a', 'sk-b'] });
    await expect(p.grade('achieve', 'x')).rejects.toThrow('Daily free limit reached');
    // Immediate retry uses no network at all — both keys are cooling down.
    const fetch = vi.fn(() => Promise.resolve(chatReply(GOOD_JSON)));
    vi.stubGlobal('fetch', fetch);
    await expect(p.grade('achieve', 'x')).rejects.toThrow('Daily free limit reached');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads comma-separated system keys with legacy fallback', () => {
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEYS', 'sk-1, sk-2 ,sk-1');
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEY', 'sk-legacy');
    const r = resolveAIProvider({ ...defaultAIConfig() });
    expect(r.source).toBe('system');
  });

  it('resolves pool entries: user keys over system keys over self-review', () => {
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEYS', 'sk-system');
    const api1 = { id: 'api1', name: 'api1', enabled: true, baseUrl: '', model: 'm', keys: ['sk-user'], invalid: false };
    // entry with own keys → user
    let r = resolveAIProvider({ ...defaultAIConfig(), apis: [api1] });
    expect(r.source).toBe('user');
    // entry without keys → system keys
    r = resolveAIProvider({ ...defaultAIConfig(), apis: [{ ...api1, keys: [] }] });
    expect(r.source).toBe('system');
    // disabled entries contribute nothing → self-review
    r = resolveAIProvider({ ...defaultAIConfig(), apis: [{ ...api1, enabled: false }] });
    expect(r.source).toBe('none');
    // nothing usable → none
    r = resolveAIProvider({ ...defaultAIConfig(), apis: [] });
    expect(r.source).toBe('none');
    // master switch off → none
    r = resolveAIProvider({ ...defaultAIConfig(), enabled: false });
    expect(r.source).toBe('none');
  });

  it('migrates legacy single-entry configs into the pool', () => {
    localStorage.setItem('lexis:writing-provider:v1', JSON.stringify({
      kind: 'openai', enabled: true, baseUrl: 'https://x.test/v1',
      model: 'm-legacy', token: 'sk-legacy', tokenInvalid: true,
    }));
    const cfg = loadProviderConfig();
    expect(cfg.kind).toBe('multi');
    expect(cfg.apis).toHaveLength(1);
    expect(cfg.apis[0]).toMatchObject({ name: 'api1', baseUrl: 'https://x.test/v1', model: 'm-legacy', invalid: true });
    expect(cfg.apis[0]!.keys).toEqual(['sk-legacy']);
  });

  it('fails over across pool APIs and records what graded', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { headers?: Record<string, string> }) => {
      const auth = init?.headers?.Authorization ?? '';
      seen.push(auth);
      if (auth === 'Bearer sk-a1') {
        return Promise.resolve(new Response('denied', { status: 401 }));
      }
      return Promise.resolve(chatReply(GOOD_JSON));
    }));
    const { MultiApiProvider: Pool } = await import('./writing-feedback');
    const pool = new Pool([
      { entry: { id: 'a1', name: 'api1', enabled: true, baseUrl: 'https://x.test/v1', model: 'm', keys: ['sk-a1'], invalid: false }, keys: ['sk-a1'] },
      { entry: { id: 'a2', name: 'api2', enabled: true, baseUrl: 'https://x.test/v1', model: 'm', keys: ['sk-a2'], invalid: false }, keys: ['sk-a2'] },
    ]);
    const fb = await pool.grade('achieve', 'We achieve things.');
    expect(fb.aiVerified).toBe(true);
    expect(seen).toEqual(['Bearer sk-a1', 'Bearer sk-a2']);
    expect(pool.lastUsed).toMatchObject({ apiId: 'a2', apiName: 'api2' });
  });

  it('throws AllKeysRejectedError naming every failed API', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 401 }))));
    
    const pool = new MultiApiProvider([
      { entry: { id: 'a1', name: 'api1', enabled: true, baseUrl: 'https://x.test/v1', model: 'm', keys: ['sk-a1'], invalid: false }, keys: ['sk-a1'] },
      { entry: { id: 'a2', name: 'api2', enabled: true, baseUrl: 'https://x.test/v1', model: 'm', keys: ['sk-a2'], invalid: false }, keys: ['sk-a2'] },
    ]);
    const err = await pool.grade('achieve', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AllKeysRejectedError);
    expect((err as AllKeysRejectedError).apiIds).toEqual(['a1', 'a2']);
  });

  it('generates collision-free api names', () => {
    expect(nextApiName([])).toBe('api1');
    expect(nextApiName([
      { id: 'x', name: 'api1', enabled: true, baseUrl: '', model: 'm', keys: [], invalid: false },
      { id: 'y', name: 'api2', enabled: true, baseUrl: '', model: 'm', keys: [], invalid: false },
    ])).toBe('api3');
  });

  it('falls back to self-review without any key', () => {
    const r = resolveAIProvider({ ...defaultAIConfig() });
    expect(r.source).toBe('none');
    expect(r.provider).toBeInstanceOf(NullProvider);
  });

  it('reads legacy custom-endpoint configs', () => {
    localStorage.setItem('lexis:writing-provider:v1', JSON.stringify({ url: 'https://c.test', apiKey: 'k', enabled: true }));
    const cfg = loadProviderConfig();
    expect(cfg.kind).toBe('custom');
    const r = resolveAIProvider(cfg);
    expect(r.source).toBe('user');
    expect(r.provider).toBeInstanceOf(CustomEndpointProvider);
    saveProviderConfig(null);
    expect(loadProviderConfig().kind).toBe('multi');
  });

  it('enforces the free-model guard helper', () => {
    expect(isFreeModel('deepseek-v4-flash-free')).toBe(true);
    expect(isFreeModel('z-ai/glm-5.3-flash')).toBe(true); // explicitly blessed Cline default
    expect(isFreeModel('meta-llama/llama-3.3-70b-instruct:free')).toBe(true);
    expect(isFreeModel('gpt-4o')).toBe(false);
    expect(isFreeModel('z-ai/glm-5.3')).toBe(false);
  });

  it('defaults to the Cline route and the blessed free model', async () => {
    const { DEFAULT_FREE_MODEL, DEFAULT_AI_BASE_URL, FREE_MODEL_EXAMPLES } = await import('./writing-feedback');
    expect(DEFAULT_AI_BASE_URL).toBe('https://api.cline.bot/api/v1');
    expect(DEFAULT_FREE_MODEL).toBe('z-ai/glm-5.3-flash');
    expect(isFreeModel(DEFAULT_FREE_MODEL)).toBe(true);
    expect(FREE_MODEL_EXAMPLES).toContain('z-ai/glm-5.3-flash');
    for (const m of FREE_MODEL_EXAMPLES) {
      expect(isFreeModel(m)).toBe(true);
    }
  });

  it('tests tokens end-to-end (mocked)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(chatReply('ok'))));
    const ok = await testOpenAIToken('https://x.test/v1', 'm:free', 'sk-good');
    expect(ok.ok).toBe(true);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 401 }))));
    const bad = await testOpenAIToken('https://x.test/v1', 'm:free', 'sk-bad');
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('unauthorized');
  });

  it('resolves empty base URL to auto (proxy-aware)', () => {
    vi.stubEnv('VITE_AI_PROXY', '1');
    expect(effectiveBaseUrl('')).toBe('/api-cline/api/v1');
    vi.stubEnv('VITE_AI_PROXY', '');
    expect(effectiveBaseUrl('')).toBe('https://api.cline.bot/api/v1');
    expect(effectiveBaseUrl('https://custom.test/v9/')).toBe('https://custom.test/v9');
  });

  it('fetches the live model catalogue, free-first', async () => {
    const payload = {
      object: 'list',
      data: [
        { id: 'big-paid-model' },
        { id: 'mimo-v2.5-free' },
        { id: 'deepseek-v4-flash-free' },
        { id: 42 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )));
    const r = await fetchAIModels('https://x.test/v1', 'sk-k');
    expect(r.ok).toBe(true);
    expect(r.models).toEqual([
      { id: 'deepseek-v4-flash-free', free: true },
      { id: 'mimo-v2.5-free', free: true },
      { id: 'big-paid-model', free: false },
    ]);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 401 }))));
    const bad = await fetchAIModels('https://x.test/v1', 'sk-bad');
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('unauthorized');
  });

  it('surfaces provider error envelopes verbatim', async () => {    const envelope = { type: 'error', error: { type: 'MissingSessionID', message: "OpenCode's free tier can only be used in OpenCode" } };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify(envelope), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )));
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1', model: 'm:free', apiKey: 'k' });
    await expect(p.grade('achieve', 'x')).rejects.toThrow('can only be used in OpenCode');
    const t = await testOpenAIToken('https://x.test/v1', 'm:free', 'k');
    expect(t.ok).toBe(false);
    expect(t.message).toContain('can only be used in OpenCode');
  });

  it('parses optional structured extras when present, omits them otherwise', async () => {
    const full = JSON.stringify({
      scores: { form: true, collocation: true, register: true, meaning: true },
      comment: 'Solid.',
      strength: 'Clear meaning.',
      improvement: 'Tighten the collocation.',
      revision: 'A better sentence here.',
      why: 'Because reasons.',
      band: 8.5,
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(chatReply(full))));
    const p = new OpenAICompatProvider({ baseUrl: 'https://x.test/v1', model: 'm:free', apiKey: 'k' });
    const fb = await p.grade('achieve', 'We achieve things.');
    expect(fb.strength).toBe('Clear meaning.');
    expect(fb.improvement).toBe('Tighten the collocation.');
    expect(fb.revision).toBe('A better sentence here.');
    expect(fb.why).toBe('Because reasons.');
    expect('band' in fb).toBe(false);

    const bare = vi.fn(() => Promise.resolve(chatReply(GOOD_JSON)));
    vi.stubGlobal('fetch', bare);
    const fb2 = await p.grade('achieve', 'We achieve things.');
    expect(fb2.strength).toBeUndefined();
    expect(fb2.improvement).toBeUndefined();
    expect(fb2.revision).toBeUndefined();
    expect(fb2.why).toBeUndefined();
  });

  it('round-trips the model cache', () => {
    expect(readModelCache()).toBeNull();
    writeModelCache([{ id: 'muse-spark-1.3-contributor-free', free: true }]);
    const cache = readModelCache();
    expect(cache?.models).toHaveLength(1);
  });
});
