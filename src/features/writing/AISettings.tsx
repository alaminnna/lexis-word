import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import {
  FREE_MODEL_EXAMPLES, defaultApiEntry, fetchAIModels, isFreeModel, isModelCacheFresh,
  loadProviderConfig, nextApiName, readModelCache, resolveAIProvider, resolveApiPool,
  saveProviderConfig, systemKey, testOpenAIToken, writeModelCache,
  type AIProviderConfig, type ApiEntry, type AIModelInfo,
} from '../../services/writing-feedback';

/** AI configuration, lifted out of the Writing Studio (spec §11): the studio
 *  is for writing, not API administration. Rendered in Settings. */
export function AISettingsCard() {
  const [cfg, setCfgState] = useState<AIProviderConfig>(() => loadProviderConfig());
  const [open, setOpen] = useState(false);
  const setCfg = (patch: Partial<AIProviderConfig>): void => {
    setCfgState((prev) => {
      const next = { ...prev, ...patch };
      saveProviderConfig(next);
      return next;
    });
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">
        Optional AI grading for the Writing Studio. Without it, self-review carries
        the full weight — the app is complete either way.
      </p>
      <AIConnectCard cfg={cfg} setCfg={setCfg} showProvider={open} setShowProvider={setOpen} tokenNotice={null} />
    </div>
  );
}

function AIConnectCard({ cfg, setCfg, showProvider, setShowProvider, tokenNotice }: {
  cfg: AIProviderConfig;
  setCfg: (patch: Partial<AIProviderConfig>) => void;
  showProvider: boolean;
  setShowProvider: (v: boolean) => void;
  tokenNotice: string | null;
}) {
  const resolved = resolveAIProvider(cfg);
  const pool = resolveApiPool(cfg);
  const anyInvalid = cfg.kind === 'multi' && cfg.apis.some((a) => a.invalid);
  const status = !cfg.enabled
    ? 'Off'
    : anyInvalid
      ? 'Key rejected'
      : cfg.kind === 'custom'
        ? (resolved.source === 'none' ? 'Self-review' : 'Your endpoint')
        : pool.length === 0
          ? 'Self-review'
          : resolved.source === 'user'
            ? `${pool.length} api${pool.length > 1 ? 's' : ''} · yours`
            : `${pool.length} api${pool.length > 1 ? 's' : ''} · system`;
  const bad = !cfg.enabled || anyInvalid || resolved.source === 'none';
  return (
    <div>
      <button
        onClick={() => setShowProvider(!showProvider)}
        aria-expanded={showProvider}
        className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 text-left"
      >
        <span className="font-medium">AI feedback</span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${bad ? (anyInvalid ? 'bg-bad-soft text-bad' : 'bg-paper-deep text-ink-soft') : 'bg-good-soft text-good'}`}>
          {status}
        </span>
      </button>
      {showProvider && (
        <div className="mt-3 space-y-4">
          <Toggle
            checked={cfg.enabled}
            onChange={(v) => setCfg({ enabled: v })}
            label="AI grading"
            hint="Rubric grades from a language model at full weight (self-review carries 0.90)"
          />
          {tokenNotice && (
            <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-[15px]">{tokenNotice}</p>
          )}
          <div>
            <p className="mb-2 font-medium">Connection</p>
            <SegmentedControl
              label="AI connection type"
              value={cfg.kind}
              onChange={(v) => setCfg({ kind: v })}
              options={[
                { value: 'multi', label: 'APIs', hint: 'Ordered pool — tried top-to-bottom with key rotation' },
                { value: 'custom', label: 'Custom endpoint', hint: 'Your own grading endpoint with its own contract' },
              ]}
            />
          </div>
          {cfg.kind === 'multi' ? (
            <ApiPoolEditor cfg={cfg} setCfg={setCfg} />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">
                Point Lexis at your own language-model endpoint to get rubric grades at full weight.
                Without it, self-review carries the work — the app is complete either way.
              </p>
              <label className="block text-sm">Endpoint URL
                <input value={cfg.url} onChange={(e) => setCfg({ url: e.target.value })}
                  placeholder="https://…" inputMode="url"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-line-strong bg-paper px-3" />
              </label>
              <label className="block text-sm">API key
                <input value={cfg.apiKey} onChange={(e) => setCfg({ apiKey: e.target.value })}
                  type="password" placeholder="Stored only on this device"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-line-strong bg-paper px-3" />
              </label>
            </div>
          )}
        </div>
      )}
     </div>
   );
 }

/** Ordered API pool: tried top-to-bottom on every grade, keys rotate on caps. */
function ApiPoolEditor({ cfg, setCfg }: {
  cfg: AIProviderConfig;
  setCfg: (patch: Partial<AIProviderConfig>) => void;
}) {
  const setApis = (apis: ApiEntry[]): void => setCfg({ apis });
  const patchEntry = (id: string, patch: Partial<ApiEntry>): void => {
    setApis(cfg.apis.map((a) => (a.id === id ? { ...a, ...patch, invalid: patch.keys ? false : a.invalid } : a)));
  };
  const moveEntry = (id: string, dir: -1 | 1): void => {
    const i = cfg.apis.findIndex((a) => a.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cfg.apis.length) return;
    const next = [...cfg.apis];
    const [entry] = next.splice(i, 1);
    next.splice(j, 0, entry!);
    setApis(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Tried top-to-bottom on every grade — a capped or rejected API is skipped
        automatically. An entry without keys uses the built-in system keys.
        Keys are asked for only when rejected, never otherwise.
      </p>
      {cfg.apis.map((entry, i) => (
        <ApiEntryEditor
          key={entry.id}
          entry={entry}
          index={i}
          total={cfg.apis.length}
          onPatch={(patch) => patchEntry(entry.id, patch)}
          onRemove={() => setApis(cfg.apis.filter((a) => a.id !== entry.id))}
          onMove={(dir) => moveEntry(entry.id, dir)}
        />
      ))}
      <Button
        variant="secondary"
        onClick={() => {
          const name = nextApiName(cfg.apis);
          setApis([...cfg.apis, { ...defaultApiEntry(cfg.apis.length + 1), name, id: `api-${Date.now().toString(36)}` }]);
        }}
      >
        + Add API
      </Button>
    </div>
  );
}

function ApiEntryEditor({ entry, index, total, onPatch, onRemove, onMove }: {
  entry: ApiEntry;
  index: number;
  total: number;
  onPatch: (patch: Partial<ApiEntry>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [testPhase, setTestPhase] = useState<{ phase: 'idle' | 'busy' | 'ok' | 'fail'; message: string }>(
    { phase: 'idle', message: '' },
  );
  const fetchKey = entry.keys[0] ?? systemKey() ?? '';

  const runTest = async (): Promise<void> => {
    if (!isFreeModel(entry.model)) {
      setTestPhase({ phase: 'fail', message: 'Only free models — pick one ending in -free.' });
      return;
    }
    const key = entry.keys[0] ?? systemKey();
    if (!key) {
      setTestPhase({ phase: 'fail', message: 'Add a key first, then test.' });
      return;
    }
    setTestPhase({ phase: 'busy', message: 'Testing…' });
    const r = await testOpenAIToken(entry.baseUrl, entry.model, key);
    if (r.ok) {
      if (entry.invalid) onPatch({ invalid: false });
      setTestPhase({ phase: 'ok', message: r.message });
    } else {
      setTestPhase({ phase: 'fail', message: r.message });
    }
  };

  const setKeyAt = (i: number, value: string): void => {
    const keys = entry.keys.map((k, j) => (j === i ? value.trim() : k));
    onPatch({ keys: keys.filter(Boolean), invalid: false });
  };

  return (
    <div className={`rounded-xl border p-3 ${entry.invalid ? 'border-bad/50' : 'border-line'}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper-deep text-sm font-medium text-ink-soft" aria-hidden>
          {index + 1}
        </span>
        <label className="sr-only" htmlFor={`api-name-${entry.id}`}>API name</label>
        <input
          id={`api-name-${entry.id}`}
          value={entry.name}
          onChange={(e) => onPatch({ name: e.target.value.slice(0, 40) })}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-medium hover:border-line focus:border-accent focus:outline-none"
        />
        <button onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${entry.name} up`}
          className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:text-ink disabled:opacity-30">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move ${entry.name} down`}
          className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:text-ink disabled:opacity-30">↓</button>
        <button onClick={onRemove} aria-label={`Remove ${entry.name}`}
          className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:text-bad">
          <Icon name="x" size={16} />
        </button>
      </div>
      {entry.invalid && (
        <p role="alert" className="mt-1 text-sm text-bad">Keys rejected — update them below, then Test.</p>
      )}
      <div className="mt-2 flex items-center gap-3">
        <Toggle checked={entry.enabled} onChange={(v) => onPatch({ enabled: v })} label="Enabled" />
      </div>
      <label className="mt-2 block text-sm">Base URL
        <input value={entry.baseUrl} onChange={(e) => onPatch({ baseUrl: e.target.value })}
          placeholder="Empty = auto (dev proxy, else api.cline.bot)" inputMode="url" spellCheck={false}
          className="mt-1 min-h-[44px] w-full rounded-lg border border-line-strong bg-paper px-3" />
      </label>
      <div className="mt-2">
        <ModelPicker baseUrl={entry.baseUrl} fetchKey={fetchKey} model={entry.model} onModel={(m) => onPatch({ model: m })} />
      </div>
      <div className="mt-2">
        <p className="text-sm font-medium">Keys <span className="font-normal text-ink-soft">(one per line box — empty uses system keys)</span></p>
        {entry.keys.map((k, i) => (
          <div key={i} className="mt-1 flex gap-1.5">
            <label className="sr-only" htmlFor={`api-key-${entry.id}-${i}`}>{`Key ${i + 1} for ${entry.name}`}</label>
            <input
              id={`api-key-${entry.id}-${i}`}
              type="password" value={k} onChange={(e) => setKeyAt(i, e.target.value)}
              placeholder="sk-…" spellCheck={false} autoComplete="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-3 font-mono text-sm" />
            <button onClick={() => onPatch({ keys: entry.keys.filter((_, j) => j !== i) })}
              aria-label={`Remove key ${i + 1}`}
              className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:text-bad">
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
        <button onClick={() => onPatch({ keys: [...entry.keys, ''] })}
          className="mt-1.5 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg px-2 text-sm text-accent-deep underline dark:text-accent">
          + Add key
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void runTest()} loading={testPhase.phase === 'busy'}>
          Test
        </Button>
        {testPhase.phase !== 'idle' && (
          <p aria-live="polite" className={`text-sm ${testPhase.phase === 'ok' ? 'text-good' : testPhase.phase === 'fail' ? 'text-bad' : 'text-ink-soft'}`}>
            {testPhase.message}
          </p>
        )}
      </div>
    </div>
  );
}

/** Live catalogue picker: reads /models through the effective route (proxy in
 *  dev), caches for 7 days, free-first ordering. The free set changes over
 *  time — this list, not hardcoded IDs, is the source of truth.
 *  Always free-filtered: paid models never enter the pool UI. */
function ModelPicker({ baseUrl, fetchKey, model, onModel }: {
  baseUrl: string;
  fetchKey: string;
  model: string;
  onModel: (m: string) => void;
}) {
  const [models, setModels] = useState<AIModelInfo[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [opened, setOpened] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState(false);

  const load = async (force: boolean): Promise<void> => {
    if (!fetchKey) {
      setError('No key available for this API — add one above, then refresh.');
      return;
    }
    if (!force) {
      const cache = readModelCache();
      if (isModelCacheFresh(cache) && cache) {
        setModels(cache.models);
        setFetchedAt(cache.fetchedAt);
        return;
      }
    }
    setLoading(true);
    setError(null);
    setSnapshotNote(false);
    const r = await fetchAIModels(baseUrl, fetchKey);
    setLoading(false);
    if (r.ok && r.models) {
      setModels(r.models);
      setFetchedAt(Date.now());
      writeModelCache(r.models);
    } else if (!models) {
      // Offline fallback: last verified snapshot so the picker never goes bare.
      const snapshot = FREE_MODEL_EXAMPLES.map((id) => ({ id, free: true }));
      setModels(snapshot);
      setSnapshotNote(true);
    } else {
      setError(r.error ?? 'Could not refresh the model list.');
    }
  };

  // Auto-load once when the section opens (cached when fresh, silent on failure).
  useEffect(() => {
    if (!opened) {
      setOpened(true);
      void load(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = (models ?? []).filter((m) => m.free);
  const inList = visible.some((m) => m.id === model);
  const showCustom = custom || (!!model && !inList);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="ai-model-pick" className="block text-sm font-medium">Model (free only)</label>
        <button
          onClick={() => void load(true)}
          disabled={loading}
          className="min-h-[36px] cursor-pointer rounded-lg px-2 text-sm text-accent-deep underline disabled:opacity-50 dark:text-accent"
        >
          {loading ? 'Refreshing…' : `Refresh list${fetchedAt ? ` · ${new Date(fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`}
        </button>
      </div>
      <select
        id="ai-model-pick"
        value={showCustom ? '__custom' : model}
        onChange={(e) => {
          if (e.target.value === '__custom') setCustom(true);
          else onModel(e.target.value);
        }}
        aria-describedby="ai-model-pick-hint"
        className="mt-1 min-h-[44px] w-full cursor-pointer rounded-lg border border-line-strong bg-paper px-2"
      >
        {!inList && !showCustom && model && <option value={model}>{model} (not in list)</option>}
        {visible.map((m) => (
          <option key={m.id} value={m.id}>{m.free ? `${m.id} · free` : m.id}</option>
        ))}
        <option value="__custom">Type another ID…</option>
      </select>
      <p id="ai-model-pick-hint" className="mt-1 text-xs text-ink-soft">Free model IDs end in “-free”.</p>
      {showCustom && (
        <label className="mt-2 block text-sm">Custom model ID
          <input value={model} onChange={(e) => onModel(e.target.value)}
            placeholder="z-ai/glm-5.3-flash" spellCheck={false} autoComplete="off"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-line-strong bg-paper px-3" />
        </label>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-warn">{error}</p>}
      {!error && models && (
        <p className="mt-1 text-xs text-ink-soft">
          {snapshotNote ? 'Saved snapshot (live list unreachable)' : `${models.filter((m) => m.free).length} free of ${models.length} models · live from the API`}
        </p>
      )}
      {model && !isFreeModel(model) && (
        <p role="alert" className="mt-1 text-sm text-warn">Only free models (names ending in -free) — grading will refuse “{model}” at test time.</p>
      )}
    </div>
  );
}
