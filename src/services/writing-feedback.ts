// WritingFeedbackProvider (§13): modular, optional AI feedback behind an
// interface. Default NullProvider — the app is fully functional without AI.
// The core engine never imports this module.
//
// Provider precedence (resolveAIProvider):
//   1. user key (Cline gateway or custom endpoint), when present & valid
//   2. built-in system keys (VITE_LEXIS_SYSTEM_KEYS) — rotated on cap errors
//   3. self-review (NullProvider)
// The UI asks for a token ONLY when the saved one is rejected (401) — never nags.

export interface RubricScores {
  form: boolean;
  collocation: boolean;
  register: boolean;
  meaning: boolean;
}

export interface WritingFeedback {
  scores: RubricScores;
  comment: string;
  aiVerified: boolean;
  /** Optional structured extras. Shown only when the provider returns them —
   *  never invented client-side. Absent on NullProvider and older adapters. */
  strength?: string;
  improvement?: string;
  revision?: string;
  why?: string;
}

export interface WritingFeedbackProvider {
  readonly name: string;
  grade(word: string, sentence: string): Promise<WritingFeedback>;
}

/** Default: no AI. Self-rubric carries the full weight (0.90). */
export class NullProvider implements WritingFeedbackProvider {
  readonly name = 'Self-review (no AI)';
  grade(_word: string, _sentence: string): Promise<WritingFeedback> {
    return Promise.resolve({
      scores: { form: false, collocation: false, register: false, meaning: false },
      comment: 'AI feedback is off. Compare your sentence with the authentic examples and grade yourself honestly.',
      aiVerified: false,
    });
  }
}

export interface CustomEndpointConfig {
  url: string;
  apiKey: string;
}

/**
 * BYOK adapter: POSTs { word, sentence, rubric } to a user-configured endpoint
 * and expects { scores: {form,collocation,register,meaning}, comment? } JSON.
 * Any failure degrades to self-review — never a blocked task.
 */
export class CustomEndpointProvider implements WritingFeedbackProvider {
  readonly name = 'Custom AI endpoint';
  constructor(private readonly config: CustomEndpointConfig) {}

  async grade(word: string, sentence: string): Promise<WritingFeedback> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(this.config.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          word,
          sentence,
          rubric: ['correct word form', 'natural collocation', 'academic register', 'meaning preserved'],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        scores?: Partial<RubricScores>;
        comment?: string;
        strength?: unknown;
        improvement?: unknown;
        revision?: unknown;
        why?: unknown;
      };
      const fb = toFeedback(data, 'Graded by your AI endpoint.');
      return fb;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider (Cline gateway and similar routes).
// ---------------------------------------------------------------------------

export const DEFAULT_AI_BASE_URL = 'https://api.cline.bot/api/v1';
export const DEFAULT_FREE_MODEL = 'z-ai/glm-5.3-flash';
/** Last verified live set (cline /models). The picker reads the live API;
 *  this constant is only the offline snapshot fallback. */
export const FREE_MODEL_EXAMPLES = [
  'z-ai/glm-5.3-flash',
  'inclusionai/ling-3.0-flash-fin:free',
  'nex-agi/nex-n2.5-mini:free',
  'nvidia/nemotron-3.5-lightning:free',
  'cohere/north-mini-code:free',
  'google/gemma-4-31b-it:free',
];

/** Free models without a free suffix (explicitly blessed IDs). */
const FREE_ALLOWLIST = new Set(['z-ai/glm-5.3-flash']);

/** Free-model guard: free tiers are tagged with a trailing -free (or allowlisted). */
export function isFreeModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (FREE_ALLOWLIST.has(m)) return true;
  return m === 'free' || m.endsWith(':free') || m.endsWith('/free') || m.endsWith('-free');
}

/** Effective base URL: explicit config wins; empty means auto (dev proxy when
 *  VITE_AI_PROXY=1, else the Cline origin). Browsers can't call the gateway
 *  directly (no CORS headers), so dev must go same-origin through /api-cline. */
export function effectiveBaseUrl(cfgBase: string): string {
  if (cfgBase.trim()) return cfgBase.trim().replace(/\/+$/, '');
  if (typeof import.meta !== 'undefined' && import.meta.env.VITE_AI_PROXY === '1') {
    return '/api-cline/api/v1';
  }
  return DEFAULT_AI_BASE_URL;
}

/** Live model catalogue (gateway → /models). The free set changes over time, so
 *  the picker reads this instead of a hardcoded list. */
export interface AIModelInfo {
  id: string;
  free: boolean;
}

export async function fetchAIModels(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; models?: AIModelInfo[]; error?: string }> {
  const base = (baseUrl || effectiveBaseUrl('')).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Token rejected (unauthorized).' };
    }
    if (!res.ok) return { ok: false, error: `Model list answered HTTP ${res.status}.` };
    const data = (await res.json()) as { data?: ({ id?: unknown } | null)[] };
    if (!Array.isArray(data.data)) return { ok: false, error: 'Unexpected model list shape.' };
    const models = data.data
      .filter((m): m is { id: string } => typeof m?.id === 'string')
      .map((m) => ({ id: m.id, free: isFreeModel(m.id) }));
    models.sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Request failed: ${err.message}` : 'Request failed.' };
  } finally {
    clearTimeout(timer);
  }
}

const MODEL_CACHE_KEY = 'lexis:ai-models:v1';
const MODEL_CACHE_TTL_MS = 7 * 86_400_000;

export interface ModelCache {
  fetchedAt: number;
  models: AIModelInfo[];
}

export function readModelCache(): ModelCache | null {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelCache;
    if (!Array.isArray(parsed.models) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeModelCache(models: AIModelInfo[]): void {
  try {
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), models }));
  } catch {
    // cache is convenience state; safe to drop
  }
}

export function isModelCacheFresh(cache: ModelCache | null, now = Date.now()): boolean {
  return !!cache && now - cache.fetchedAt < MODEL_CACHE_TTL_MS;
}

/** Thrown when the API rejects the key/session — the UI then asks for a fresh token. */
export class TokenExpiredError extends Error {
  constructor(message = 'API token was rejected (unauthorized).') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

const GRADER_SYSTEM_PROMPT = [
  'You grade one English sentence that must use a given academic word.',
  'Reply with ONLY a JSON object, no markdown, no extra text, with exactly these keys:',
  '{"scores":{"form":boolean,"collocation":boolean,"register":boolean,"meaning":boolean},"comment":string,',
  '"strength":string,"improvement":string,"revision":string,"why":string}.',
  'form: correct word form for the sentence. collocation: natural partner words.',
  'register: fits an IELTS Task 2 essay. meaning: the intended meaning is preserved.',
  'comment: one short advice sentence, max 25 words.',
  'strength: the single clearest strength of this sentence (max 20 words).',
  'improvement: the single most useful improvement (max 25 words).',
  'revision: a revised sentence ONLY when it genuinely helps, else an empty string. Never rewrite just to rewrite.',
  'why: one short reason for the revision, else an empty string.',
  'Never invent IELTS band scores. Never write motivational paragraphs.',
].join(' ');

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in AI reply.');
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

/** Gateways answer some failures as HTTP 200 with an error envelope — surface the
 *  provider's own message instead of a cryptic fallback. Cline uses the same
 *  idea without the top-level type tag, so both shapes are recognized. */
function envelopeError(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { type?: unknown; error?: unknown };
  const err = d.error;
  const message = typeof err === 'string' && err
    ? err
    : typeof err === 'object' && err !== null &&
      typeof (err as { message?: unknown }).message === 'string'
      ? ((err as { message?: unknown }).message as string)
      : null;
  if (!message) return null;
  if (d.type === 'error') return message;
  // Cline-style: { error: { code, message } } with no top-level tag.
  if (typeof err === 'object' && err !== null) return message;
  return null;
}

function toFeedback(data: unknown, fallbackComment: string): WritingFeedback {
  const d = (typeof data === 'object' && data !== null ? data : {}) as {
    scores?: Partial<Record<keyof RubricScores, unknown>>;
    comment?: unknown;
    strength?: unknown;
    improvement?: unknown;
    revision?: unknown;
    why?: unknown;
  };
  const s = d.scores ?? {};
  const bool = (v: unknown): boolean => v === true;
  const text = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined;
  const out: WritingFeedback = {
    scores: { form: bool(s.form), collocation: bool(s.collocation), register: bool(s.register), meaning: bool(s.meaning) },
    comment: typeof d.comment === 'string' && d.comment.trim() ? d.comment.trim() : fallbackComment,
    aiVerified: true,
  };
  const strength = text(d.strength);
  const improvement = text(d.improvement);
  const revision = text(d.revision);
  const why = text(d.why);
  if (strength) out.strength = strength;
  if (improvement) out.improvement = improvement;
  if (revision) out.revision = revision;
  if (why) out.why = why;
  return out;
}

export interface OpenAICompatConfig {
  baseUrl: string;
  model: string;
  /** Single key (kept for backward compat) — prefer apiKeys for rotation. */
  apiKey?: string;
  /** System/user keys tried in order; first healthy key wins per call. */
  apiKeys?: string[];
}

/** Per-key cooldowns after cap errors ("try again in 3h 4m" style). */
const keyCooldowns = new Map<string, { until: number; message: string }>();

function parseCooldownMs(message: string): number {
  const hm = message.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m/i);
  if (hm) return Math.max(60_000, ((Number(hm[1]) * 60) + Number(hm[2] ?? 0)) * 60_000);
  const m = message.match(/(\d+)\s*m(?:inutes?)?/i);
  if (m) return Math.max(60_000, Number(m[1]) * 60_000);
  return 30 * 60_000;
}

/** 429s and cap/quota envelopes rotate; auth failures do not (per key). */
function isCapFailure(status: number, message: string): boolean {
  if (status === 429) return true;
  return /limit|quota|capacity|cap\b|rate/i.test(message);
}

export function resetKeyCooldowns(): void {
  keyCooldowns.clear();
}

export class OpenAICompatProvider implements WritingFeedbackProvider {
  readonly name = 'OpenAI-compatible';
  private readonly keys: string[];

  constructor(private readonly config: OpenAICompatConfig) {
    const list = [...(config.apiKeys ?? []), ...(config.apiKey ? [config.apiKey] : [])]
      .map((k) => k.trim())
      .filter(Boolean);
    this.keys = [...new Set(list)];
  }

  private endpoint(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private headers(key: string): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    };
    // Gateway convention; harmless elsewhere.
    if (typeof window !== 'undefined' && window.location.origin) {
      h['HTTP-Referer'] = window.location.origin;
      h['X-Title'] = 'Lexis';
    }
    return h;
  }

  private async attempt(key: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await fetch(this.endpoint(), {
        method: 'POST',
        signal: controller.signal,
        headers: this.headers(key),
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readError(res: Response): Promise<string> {
    try {
      const data = (await res.json()) as unknown;
      return envelopeError(data) ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async grade(word: string, sentence: string): Promise<WritingFeedback> {
    if (this.keys.length === 0) throw new Error('No API key configured.');
    const now = Date.now();
    let lastError: unknown = null;
    let sawAuthFailure = false;
    for (const key of this.keys) {
      if ((keyCooldowns.get(key)?.until ?? 0) > now) continue; // cooling down, skip
      let res: Response;
      try {
        res = await this.attempt(key, {
          model: this.config.model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            { role: 'system', content: GRADER_SYSTEM_PROMPT },
            { role: 'user', content: `Word: "${word}". Sentence: "${sentence}"` },
          ],
        });
      } catch (err) {
        lastError = err; // network/timeout — try the next key
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        sawAuthFailure = true;
        lastError = new TokenExpiredError();
        continue;
      }
      if (!res.ok) {
        const message = await this.readError(res);
        lastError = new Error(`AI: ${message}`);
        if (isCapFailure(res.status, message)) {
          keyCooldowns.set(key, { until: Date.now() + parseCooldownMs(message), message });
          continue; // capped on this key — rotate
        }
        throw lastError; // hard failure, no point burning more keys
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const envelope = envelopeError(data);
      if (envelope) {
        lastError = new Error(`AI: ${envelope}`);
        if (isCapFailure(200, envelope)) {
          keyCooldowns.set(key, { until: Date.now() + parseCooldownMs(envelope), message: envelope });
          continue;
        }
        throw lastError;
      }
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('Empty AI reply.');
      return toFeedback(extractJson(content), 'Graded by the AI endpoint.');
    }
    if (sawAuthFailure && this.keys.length === 1) throw new TokenExpiredError();
    if (sawAuthFailure) throw new TokenExpiredError('All API keys were rejected (unauthorized).');
    if (lastError instanceof Error) throw lastError;
    // Every key is cooling down — report the freshest remembered cap message.
    let remembered: { until: number; message: string } | null = null;
    for (const key of this.keys) {
      const cd = keyCooldowns.get(key);
      if (cd && (!remembered || cd.until > remembered.until)) remembered = cd;
    }
    throw new Error(remembered ? `AI: ${remembered.message}` : 'AI request failed.');
  }
}

/** Connectivity check used by the Settings "Test" button (tiny free call). */
export async function testOpenAIToken(
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const base = effectiveBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model.trim(),
        temperature: 0,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      }),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Token rejected (unauthorized). Check the key and try again.' };
    }
    if (!res.ok) return { ok: false, message: `Endpoint answered HTTP ${res.status}. Check base URL / model.` };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const envelope = envelopeError(data);
    if (envelope) return { ok: false, message: `Endpoint says: ${envelope}` };
    const reply = data.choices?.[0]?.message?.content;
    const text = typeof reply === 'string' ? reply.trim().slice(0, 60) : '';
    return { ok: true, message: `Connected — model replied: “${text || 'ok'}”.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? `Request failed: ${err.message}` : 'Request failed.' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Stored configuration + resolution.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stored configuration + resolution (multi-API pool).
// ---------------------------------------------------------------------------

export type AIProviderKind = 'multi' | 'custom';

/** One API in the pool (api1, api2, …). Tried top-to-bottom on every grade. */
export interface ApiEntry {
  id: string;
  name: string;
  enabled: boolean;
  /** empty = auto (dev proxy when VITE_AI_PROXY=1, else Cline origin) */
  baseUrl: string;
  model: string;
  /** own keys, one per line in the UI; empty = use the system keys */
  keys: string[];
  /** set when this entry's keys were rejected — repaste asked only then */
  invalid: boolean;
}

export interface AIProviderConfig {
  kind: AIProviderKind;
  enabled: boolean;
  /** custom-endpoint fields (kind custom only) */
  url: string;
  apiKey: string;
  /** ordered pool, tried top-to-bottom (kind multi) */
  apis: ApiEntry[];
  freeOnly: boolean;
}

const STORAGE_KEY = 'lexis:writing-provider:v1';

export function defaultApiEntry(n: number): ApiEntry {
  return {
    id: `api${n}`,
    name: `api${n}`,
    enabled: true,
    baseUrl: '',
    model: DEFAULT_FREE_MODEL,
    keys: [],
    invalid: false,
  };
}

/** Next apiN name that doesn't collide with existing entries. */
export function nextApiName(apis: ApiEntry[]): string {
  let n = apis.length + 1;
  const taken = new Set(apis.map((a) => a.name));
  while (taken.has(`api${n}`)) n++;
  return `api${n}`;
}

function sanitizeEntry(raw: unknown, fallbackN: number): ApiEntry {
  const base = defaultApiEntry(fallbackN);
  if (typeof raw !== 'object' || raw === null) return base;
  const d = raw as Record<string, unknown>;
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `api${fallbackN}`,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 40) : `api${fallbackN}`,
    enabled: typeof d.enabled === 'boolean' ? d.enabled : true,
    baseUrl: typeof d.baseUrl === 'string' ? d.baseUrl.trim() : '',
    model: typeof d.model === 'string' && d.model.trim() ? d.model.trim() : DEFAULT_FREE_MODEL,
    keys: Array.isArray(d.keys)
      ? [...new Set(d.keys.filter((k): k is string => typeof k === 'string').map((k) => k.trim()).filter(Boolean))]
      : [],
    invalid: d.invalid === true,
  };
}

export function defaultAIConfig(): AIProviderConfig {
  return {
    kind: 'multi',
    enabled: true,
    url: '',
    apiKey: '',
    apis: [{ ...defaultApiEntry(1), model: DEFAULT_FREE_MODEL }],
    freeOnly: true,
  };
}

/** Reads stored config; migrates legacy shapes (custom endpoint, single openai
 *  entry with baseUrl/model/token) into the pool. Never throws. */
export function loadProviderConfig(): AIProviderConfig {
  const base = defaultAIConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.kind === 'custom' || d.kind === 'multi') base.kind = d.kind;
    else if (typeof d.url === 'string' && d.url) base.kind = 'custom';
    // Legacy single-entry ('openai') configs migrate into a one-item pool.
    else base.kind = 'multi';
    if (typeof d.enabled === 'boolean') base.enabled = d.enabled;
    if (typeof d.url === 'string') base.url = d.url;
    if (typeof d.apiKey === 'string') base.apiKey = d.apiKey;
    if (Array.isArray(d.apis) && d.apis.length > 0) {
      base.apis = d.apis.map((a, i) => sanitizeEntry(a, i + 1));
    } else {
      const legacyBase = typeof d.baseUrl === 'string' ? d.baseUrl.trim() : '';
      const legacyModel = typeof d.model === 'string' && d.model.trim() ? d.model.trim() : DEFAULT_FREE_MODEL;
      const legacyKeys = typeof d.token === 'string' && d.token.trim() ? [d.token.trim()] : [];
      const entry = sanitizeEntry({ name: 'api1', baseUrl: legacyBase, model: legacyModel, keys: legacyKeys }, 1);
      if (d.tokenInvalid === true) entry.invalid = true;
      base.apis = [entry];
    }
    // Retired explicit defaults go back to auto (proxy-aware).
    for (const a of base.apis) {
      if (a.baseUrl === 'https://openrouter.ai/api/v1' || a.baseUrl === 'https://opencode.ai/zen/v1') {
        a.baseUrl = '';
      }
    }
    if (typeof d.freeOnly === 'boolean') base.freeOnly = d.freeOnly;
    return base;
  } catch {
    return base;
  }
}

export function saveProviderConfig(config: AIProviderConfig | null): void {
  try {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // provider config is convenience state; safe to drop
  }
}

/** Built-in system keys (env, comma-separated for rotation). Client-side keys
 *  are extractable — treat as low-trust, rotate if the quota is abused. */
export function systemKeys(): string[] {
  const plural = (import.meta.env.VITE_LEXIS_SYSTEM_KEYS as string | undefined) ?? '';
  const single = (import.meta.env.VITE_LEXIS_SYSTEM_KEY as string | undefined) ?? '';
  const raw = plural || single;
  return [...new Set(raw.split(',').map((k) => k.trim()).filter(Boolean))];
}

/** First system key, for presence checks. Prefer systemKeys() for calls. */
export function systemKey(): string | null {
  return systemKeys()[0] ?? null;
}

export type AISource = 'user' | 'system' | 'none';

export interface ResolvedAI {
  provider: WritingFeedbackProvider;
  source: AISource;
}

/** Thrown when every tried API rejected its keys — the UI then asks per API. */
export class AllKeysRejectedError extends TokenExpiredError {
  constructor(
    readonly apiIds: string[],
    readonly apiNames: string[],
  ) {
    super(`API keys rejected on: ${apiNames.join(', ') || 'all apis'}.`);
    this.name = 'AllKeysRejectedError';
  }
}

export interface ResolvedApi {
  entry: ApiEntry;
  keys: string[];
}

/**
 * Ordered failover pool: tries enabled APIs top-to-bottom, each with its own
 * keys (or the system keys when empty). First success wins; per-key cap
 * cooldowns live in OpenAICompatProvider. Records what actually graded.
 */
export class MultiApiProvider implements WritingFeedbackProvider {
  readonly name = 'API pool';
  lastUsed: { apiId: string; apiName: string; model: string } | null = null;

  constructor(private readonly apis: ResolvedApi[]) {}

  async grade(word: string, sentence: string): Promise<WritingFeedback> {
    let lastError: unknown = null;
    const authFailedIds: string[] = [];
    const authFailedNames: string[] = [];
    for (const api of this.apis) {
      const inner = new OpenAICompatProvider({
        baseUrl: effectiveBaseUrl(api.entry.baseUrl),
        model: api.entry.model.trim() || DEFAULT_FREE_MODEL,
        apiKeys: api.keys,
      });
      try {
        const fb = await inner.grade(word, sentence);
        this.lastUsed = { apiId: api.entry.id, apiName: api.entry.name, model: api.entry.model };
        return fb;
      } catch (err) {
        lastError = err;
        if (err instanceof TokenExpiredError) {
          authFailedIds.push(api.entry.id);
          authFailedNames.push(api.entry.name);
        }
        // Any failure (auth, cap, 5xx, parse) moves to the next API —
        // its backend or quota may be healthy.
      }
    }
    if (authFailedIds.length > 0 && authFailedIds.length === this.apis.length && this.apis.length > 0) {
      throw new AllKeysRejectedError(authFailedIds, authFailedNames);
    }
    throw lastError instanceof Error ? lastError : new Error('AI request failed.');
  }
}

/** Enabled pool entries with resolved keys (entry keys, else system keys). */
export function resolveApiPool(cfg: AIProviderConfig): ResolvedApi[] {
  const sys = systemKeys();
  const out: ResolvedApi[] = [];
  for (const entry of cfg.apis) {
    if (!entry.enabled) continue;
    const keys = entry.keys.length > 0 ? entry.keys : sys;
    if (keys.length === 0) continue;
    out.push({ entry, keys });
  }
  return out;
}

/** Pool (ordered failover) → custom endpoint → self-review. Never throws. */
export function resolveAIProvider(cfg: AIProviderConfig = loadProviderConfig()): ResolvedAI {
  if (!cfg.enabled) return { provider: new NullProvider(), source: 'none' };
  if (cfg.kind === 'custom') {
    if (cfg.url && cfg.apiKey) {
      return { provider: new CustomEndpointProvider({ url: cfg.url, apiKey: cfg.apiKey }), source: 'user' };
    }
    return { provider: new NullProvider(), source: 'none' };
  }
  const pool = resolveApiPool(cfg);
  if (pool.length === 0) return { provider: new NullProvider(), source: 'none' };
  const primaryHasKeys = pool[0]!.entry.keys.length > 0;
  return { provider: new MultiApiProvider(pool), source: primaryHasKeys ? 'user' : 'system' };
}

/** Legacy entry point — prefer resolveAIProvider. */
export function activeProvider(): WritingFeedbackProvider {
  return resolveAIProvider().provider;
}
