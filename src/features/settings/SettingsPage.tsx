import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../app/layout';
import { useSettings } from '../../store/settings';
import { useProgress, progressSnapshot } from '../../store/progress';
import { settingsSnapshot } from '../../store/settings';
import { persistence } from '../../services/persistence';
import { speech, getSpeechAvailable, type VoiceInfo } from '../../services/speech';
import { dictionary } from '../../services/dictionary';
import { hasSeedFiles, seedDictionaryCache } from '../../services/dict-seed';
import { WORDS } from '../../data/words';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import { Icon } from '../../components/ui/Icon';
import { previewFeedback } from '../../services/feedback';
import { supportsHaptics, vibrateSample } from '../../services/haptics';
import { AISettingsCard } from '../writing/AISettings';

function Stepper({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong text-xl disabled:opacity-40"
        >
          −
        </button>
        <span className="w-8 text-center font-display text-xl" aria-live="polite">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong text-xl disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SoundHapticsSettings() {
  const sound = useSettings((s) => s.sound);
  const haptics = useSettings((s) => s.haptics);
  const updateSound = useSettings((s) => s.updateSound);
  const updateHaptics = useSettings((s) => s.updateHaptics);
  const hapticsSupported = supportsHaptics();

  return (
    <Card className="space-y-5">
      <h2 className="font-display text-xl">Sound & haptics</h2>
      <p className="-mt-3 text-sm text-ink-soft">
        Soft chimes and gentle vibration for answers — never game noise. Both work offline, on phone and PC.
      </p>

      <div>
        <Toggle
          checked={sound.enabled}
          onChange={(v) => updateSound({ enabled: v })}
          label="Sound effects"
          hint="Synthesized tones, no audio files"
        />
        {sound.enabled && (
          <div className="mt-3 space-y-4 pl-1">
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="sound-volume" className="font-medium">Volume</label>
                <span className="text-sm text-ink-soft" aria-live="polite">{Math.round(sound.volume * 100)}%</span>
              </div>
              <input
                id="sound-volume"
                type="range"
                min={0}
                max={100}
                value={Math.round(sound.volume * 100)}
                onChange={(e) => updateSound({ volume: Number(e.target.value) / 100 })}
                className="h-11 w-full cursor-pointer accent-[#0f766e]"
                aria-valuetext={`${Math.round(sound.volume * 100)} percent`}
              />
            </div>
            <div>
              <p className="mb-2 font-medium">Theme</p>
              <SegmentedControl
                label="Sound theme"
                value={sound.theme}
                onChange={(v) => updateSound({ theme: v })}
                options={[
                  { value: 'chime', label: 'Chime', hint: 'Two-note motifs, calm and warm' },
                  { value: 'pulse', label: 'Pulse', hint: 'Single soft blips, extra quiet' },
                ]}
              />
            </div>
            <fieldset>
              <legend className="font-medium">Play sound for</legend>
              <div className="mt-1 space-y-1">
                <CheckRow label="Correct answers" checked={sound.playCorrect} onChange={(v) => updateSound({ playCorrect: v })} />
                <CheckRow label="Wrong answers" checked={sound.playIncorrect} onChange={(v) => updateSound({ playIncorrect: v })} />
                <CheckRow label="Session complete" checked={sound.playComplete} onChange={(v) => updateSound({ playComplete: v })} />
                <CheckRow label="Button taps" hint="Off by default — can get chatty" checked={sound.playUiTap} onChange={(v) => updateSound({ playUiTap: v })} />
              </div>
            </fieldset>
            <Button variant="secondary" onClick={() => previewFeedback()}>
              <Icon name="speaker" size={18} /> Preview sounds
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <Toggle
          checked={haptics.enabled}
          onChange={(v) => updateHaptics({ enabled: v })}
          label="Haptics (vibration)"
          hint={hapticsSupported ? 'Phone vibration on answers' : 'Not supported on this device/browser — e.g. iPhone Safari'}
        />
        {haptics.enabled && (
          <div className="mt-3 space-y-4 pl-1">
            <div>
              <p className="mb-2 font-medium">Intensity</p>
              <SegmentedControl
                label="Haptic intensity"
                value={haptics.intensity}
                onChange={(v) => updateHaptics({ intensity: v })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'strong', label: 'Strong' },
                ]}
              />
            </div>
            <fieldset>
              <legend className="font-medium">Vibrate for</legend>
              <div className="mt-1 space-y-1">
                <CheckRow label="Correct answers" checked={haptics.onCorrect} onChange={(v) => updateHaptics({ onCorrect: v })} />
                <CheckRow label="Wrong answers" checked={haptics.onIncorrect} onChange={(v) => updateHaptics({ onIncorrect: v })} />
              </div>
            </fieldset>
            <Button
              variant="secondary"
              disabled={!hapticsSupported}
              onClick={() => vibrateSample(useSettings.getState().haptics.intensity)}
            >
              Test vibration
            </Button>
            <p className="text-xs text-ink-faint">Haptics pause automatically when your system requests reduced motion.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function CheckRow({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 cursor-pointer accent-[#0f766e]"
      />
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-sm text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

function VoiceSettings() {
  const preferredVoiceURI = useSettings((s) => s.preferredVoiceURI);
  const speechRate = useSettings((s) => s.speechRate);
  const update = useSettings((s) => s.update);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void speech.getVoices().then(setVoices);
    void getSpeechAvailable().then(setAvailable);
  }, []);

  const preview = async (): Promise<void> => {
    setPreviewing(true);
    speech.init();
    try {
      await speech.speak('The findings carry significant implications.', { voiceURI: preferredVoiceURI, rate: speechRate });
    } catch {
      // errors surface via the availability notice below
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Card className="space-y-4">
      <h2 className="font-display text-xl">Voice & audio</h2>
      {available === false && (
        <p className="text-warn">No speech voices on this device — listening items adapt automatically.</p>
      )}
      <div>
        <label htmlFor="voice-pick" className="mb-1 block font-medium">Voice</label>
        <select
          id="voice-pick"
          value={preferredVoiceURI ?? ''}
          onChange={(e) => update({ preferredVoiceURI: e.target.value || undefined })}
          className="min-h-[44px] w-full cursor-pointer rounded-lg border border-line-strong bg-paper px-3"
        >
          <option value="">Automatic (British → Australian → US)</option>
          {voices.map((v) => (
            <option key={v.uri} value={v.uri}>{v.name} — {v.lang}</option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-2 font-medium">Speed</p>
        <SegmentedControl
          label="Speech rate"
          value={String(speechRate)}
          onChange={(v) => update({ speechRate: Number(v) as 0.75 | 0.9 | 1 })}
          options={[
            { value: '0.75', label: '0.75×' },
            { value: '0.9', label: '0.9×' },
            { value: '1', label: '1.0×' },
          ]}
        />
      </div>
      <Button variant="secondary" onClick={() => void preview()} loading={previewing}>
        <Icon name="speaker" size={18} /> Preview voice
      </Button>
    </Card>
  );
}

function DictionaryStatus() {
  const [status, setStatus] = useState(dictionary.getStatus());
  const [testing, setTesting] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => dictionary.onStatusChange(setStatus), []);

  const test = async (): Promise<void> => {
    setTesting(true);
    setDetail(null);
    const r = await dictionary.retry('analysis');
    setTesting(false);
    setDetail(r.source === 'network' && r.entry
      ? `Connected — “analysis” returned ${r.entry.defs.length} entr${r.entry.defs.length === 1 ? 'y' : 'ies'}.`
      : r.source === 'cache'
        ? 'Served from cache (offline). Studying continues normally.'
        : 'Unreachable (network or CORS). Studying continues normally with local data.');
  };

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-xl">Dictionary enrichment</h2>
      <p className="text-ink-soft">
        Status: <strong className={status === 'available' ? 'text-good' : status === 'unavailable' ? 'text-warn' : ''}>
          {status === 'available' ? 'Connected' : status === 'unavailable' ? 'Offline' : 'Not checked yet'}
        </strong>
      </p>
      <p className="text-sm text-ink-soft">
        Enrichment adds full definitions and IELTS examples on Word pages. It is never required to study.
        Developers: set <code>VITE_DICT_PROXY=1</code> to route through the Vite dev proxy (see README).
      </p>
      <div>
        <Button variant="secondary" onClick={() => void test()} loading={testing}>Test connection</Button>
      </div>
      {detail && <p aria-live="polite" className="text-sm">{detail}</p>}
      {import.meta.env.DEV && <SeedCacheSection />}
    </Card>
  );
}

/**
 * Dev-only: bulk-load `public/dict-seed/*.json` (see scripts/fetch-dict-seed.mjs)
 * into the IndexedDB dictionary cache through the normal normalization path.
 * Same TTL semantics as live fetches; missing files are simply skipped.
 */
function SeedCacheSection() {
  const [state, setState] = useState<{ phase: 'idle' | 'working' | 'done'; done: number; total: number; errors: number; noFiles: boolean }>(
    { phase: 'idle', done: 0, total: WORDS.length, errors: 0, noFiles: false },
  );

  const seed = async (): Promise<void> => {
    try {
      if (!(await hasSeedFiles())) {
        setState((s) => ({ ...s, noFiles: true }));
        return;
      }
    } catch {
      setState((s) => ({ ...s, noFiles: true }));
      return;
    }
    setState({ phase: 'working', done: 0, total: WORDS.length, errors: 0, noFiles: false });
    const { done, errors } = await seedDictionaryCache((p) => {
      setState({
        phase: p.done === p.total ? 'done' : 'working',
        done: p.done, total: p.total, errors: p.errors, noFiles: false,
      });
    });
    dictionary.noteCacheSeeded(done - errors);
  };

  return (
    <div className="rounded-lg border border-dashed border-line-strong p-3">
      <p className="font-medium">Local seed cache (dev)</p>
      <p className="text-sm text-ink-soft">
        Loads <code>public/dict-seed/*.json</code> into the dictionary cache.
        Generate files with <code>node scripts/fetch-dict-seed.mjs</code>.
      </p>
      {state.noFiles && (
        <p className="mt-1 text-sm text-warn">No seed files found — run <code>node scripts/fetch-dict-seed.mjs</code> first.</p>
      )}
      <div className="mt-2">
        <Button
          variant="secondary"
          onClick={() => void seed()}
          loading={state.phase === 'working'}
          disabled={state.phase === 'working'}
        >
          {state.phase === 'done' ? 'Reload seed cache' : 'Load seed cache'}
        </Button>
      </div>
      {(state.phase === 'working' || state.phase === 'done') && (
        <p aria-live="polite" className="mt-2 text-sm">
          {state.done}/{state.total} words cached{state.errors > 0 ? ` (${state.errors} skipped)` : ''}
          {state.phase === 'done' ? ' — open any Word page to see enriched data.' : '…'}
        </p>
      )}
    </div>
  );
}

function DataSettings() {
  const replaceAll = useProgress((s) => s.replaceAll);
  const resetProgress = useProgress((s) => s.resetProgress);
  const updateSettings = useSettings((s) => s.update);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importOk, setImportOk] = useState(false);
  const [armReset, setArmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ progress: Parameters<typeof replaceAll>[0]; settings: Parameters<typeof updateSettings>[0] } | null>(null);

  const doExport = (): void => {
    const blob = new Blob([persistence.exportAll(progressSnapshot(), settingsSnapshot())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexis-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File): Promise<void> => {
    setImportError(null);
    setImportOk(false);
    try {
      const { progress, settings } = persistence.importAll(await file.text());
      setPendingImport({ progress, settings });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <Card className="space-y-4">
      <h2 className="font-display text-xl">Your data</h2>
      <p className="text-ink-soft">Everything lives on this device. Export regularly if you study on two devices.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={doExport}><Icon name="download" size={18} /> Export</Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Import</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          aria-label="Choose export file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {pendingImport && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft p-3">
          <p className="font-medium">Replace all progress with this file?</p>
          <p className="text-sm text-ink-soft">This overwrites words, history, and settings on this device. Export first if unsure.</p>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                replaceAll(pendingImport.progress);
                updateSettings(pendingImport.settings);
                setPendingImport(null);
                setImportOk(true);
              }}
            >
              Yes, replace everything
            </Button>
            <Button variant="ghost" onClick={() => setPendingImport(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {importError && <p role="alert" className="text-bad">{importError}</p>}
      {importOk && <p aria-live="polite" className="text-good">Import complete — progress restored.</p>}
      <div className="border-t border-line pt-4">
        {!armReset ? (
          <Button variant="danger" onClick={() => setArmReset(true)}><Icon name="trash" size={18} /> Reset all progress</Button>
        ) : (
          <div className="rounded-lg border border-bad/40 p-3">
            <p className="font-medium">Really erase everything? This cannot be undone.</p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  persistence.resetAll();
                  resetProgress();
                  setArmReset(false);
                }}
              >
                Yes, erase everything
              </Button>
              <Button variant="ghost" onClick={() => setArmReset(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" sub="Study load, language, voice, and your data." />
      <Card className="space-y-5">
        <h2 className="font-display text-xl">Study load</h2>
        <Stepper label="New words per day" value={settings.dailyNewTarget} min={4} max={15}
          hint="Across all sessions. Reviews always come first."
          onChange={(v) => settings.update({ dailyNewTarget: v })} />
        <Stepper label="Items per session" value={settings.sessionLengthTarget} min={10} max={25}
          hint="15 items ≈ 12 minutes."
          onChange={(v) => settings.update({ sessionLengthTarget: v })} />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Bengali meanings</h2>
        <SegmentedControl
          label="Bengali display policy"
          value={settings.bengaliPolicy}
          onChange={(v) => settings.update({ bengaliPolicy: v })}
          options={[
            { value: 'on-demand', label: 'On demand', hint: 'Tap to reveal — recall first (recommended)' },
            { value: 'fade', label: 'Fade out', hint: 'Shown for new words, hidden as recall strengthens' },
            { value: 'always', label: 'Always', hint: 'Always visible alongside English' },
          ]}
        />
      </Card>
      <VoiceSettings />
      <SoundHapticsSettings />
      <Card className="space-y-3">
        <h2 className="font-display text-xl">AI Feedback</h2>
        <AISettingsCard />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-xl">Appearance</h2>
        <SegmentedControl
          label="Theme"
          value={settings.theme}
          onChange={(v) => settings.update({ theme: v })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>
      <DictionaryStatus />
      <DataSettings />
    </div>
  );
}
