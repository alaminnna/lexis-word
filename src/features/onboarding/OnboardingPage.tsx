import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings, settingsSnapshot } from '../../store/settings';
import { useProgress, progressSnapshot } from '../../store/progress';
import { persistence } from '../../services/persistence';
import { speech, getSpeechAvailable } from '../../services/speech';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Icon } from '../../components/ui/Icon';

/**
 * First-run onboarding: ≤90 seconds, 5 steps, skippable (§17).
 * Ends with a 3-line explanation of the method (trust-building).
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const setDone = useProgress((s) => s.setOnboardingDone);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.displayName);
  const [goal, setGoal] = useState<'abroad' | 'work' | 'migration'>('abroad');
  const [voiceState, setVoiceState] = useState<'idle' | 'playing' | 'ok' | 'unavailable'>('idle');

  const saveName = (raw: string): void => {
    settings.update({ displayName: raw.trim().slice(0, 40) });
  };

  const finish = (): void => {
    saveName(name);
    setDone();
    // /onboarding never mounts AppLayout, so the debounced persistence
    // subscriber isn't running here — save synchronously or the flag (and
    // every choice above) dies with this page and onboarding reappears.
    try {
      persistence.saveProgress(progressSnapshot());
      persistence.saveSettings(settingsSnapshot());
    } catch {
      // storage errors surface via the quota flow; onboarding still completes
    }
    navigate('/', { replace: true });
  };

  const testVoice = async (): Promise<void> => {
    setVoiceState('playing');
    speech.init();
    const available = await getSpeechAvailable();
    if (!available) {
      setVoiceState('unavailable');
      return;
    }
    try {
      await speech.speak('analysis', { voiceURI: settings.preferredVoiceURI, rate: settings.speechRate });
      setVoiceState('ok');
    } catch {
      setVoiceState('unavailable');
    }
  };

  const steps = [
    // 0 — name
    <div key="name">
      <h1 className="font-display text-3xl font-medium tracking-tight">What should we call you?</h1>
      <p className="mt-2 text-ink-soft">Your name shows up in greetings around the app. You can change it anytime in Settings.</p>
      <div className="mt-5">
        <label htmlFor="onboarding-name" className="mb-1 block font-medium">Your name</label>
        <input
          id="onboarding-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          onBlur={(e) => saveName(e.target.value)}
          placeholder="e.g. Arif"
          autoComplete="given-name"
          maxLength={40}
          className="min-h-[48px] w-full rounded-xl border border-line-strong bg-paper px-3 text-[16px] transition-calm placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>
    </div>,
    // 1 — goal
    <div key="goal">
      <h1 className="font-display text-3xl font-medium tracking-tight">What brings you here?</h1>
      <p className="mt-2 text-ink-soft">This sets a sensible starting pace. You can change everything later.</p>
      <div className="mt-5 flex flex-col gap-2" role="radiogroup" aria-label="Your goal">
        {([
          { v: 'abroad', t: 'Study abroad', d: 'University admission, English-medium courses' },
          { v: 'work', t: 'Work', d: 'Professional registration or a job abroad' },
          { v: 'migration', t: 'Migration', d: 'Visa points and settlement requirements' },
        ] as const).map((o) => (
          <button
            key={o.v}
            role="radio"
            aria-checked={goal === o.v}
            onClick={() => {
              setGoal(o.v);
              settings.update({ dailyNewTarget: o.v === 'abroad' ? 10 : o.v === 'work' ? 8 : 6 });
            }}
            className={`cursor-pointer rounded-xl border p-4 text-left transition-calm ${
              goal === o.v ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'
            }`}
          >
            <p className="font-medium">{o.t}</p>
            <p className="text-sm text-ink-soft">{o.d}</p>
          </button>
        ))}
      </div>
    </div>,
    // 1 — time budget → item count
    <div key="time">
      <h1 className="font-display text-3xl font-medium tracking-tight">How much time per session?</h1>
      <p className="mt-2 text-ink-soft">Short, frequent sessions beat rare long ones. Pick what fits your day.</p>
      <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Session length">
        {([
          { items: 10, mins: '≈ 8 min' },
          { items: 15, mins: '≈ 12 min' },
          { items: 20, mins: '≈ 16 min' },
          { items: 25, mins: '≈ 20 min' },
        ]).map((o) => (
          <button
            key={o.items}
            role="radio"
            aria-checked={settings.sessionLengthTarget === o.items}
            onClick={() => settings.update({ sessionLengthTarget: o.items })}
            className={`cursor-pointer rounded-xl border p-4 text-left transition-calm ${
              settings.sessionLengthTarget === o.items ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'
            }`}
          >
            <p className="font-display text-2xl">{o.items} items</p>
            <p className="text-sm text-ink-soft">{o.mins} per session</p>
          </button>
        ))}
      </div>
    </div>,
    // 2 — Bengali policy
    <div key="bn">
      <h1 className="font-display text-3xl font-medium tracking-tight">Bengali meanings?</h1>
      <p className="mt-2 text-ink-soft">
        Bengali is scaffolding: it helps you climb, then steps back. We recommend showing it only when you ask —
        trying to recall first is what builds memory.
      </p>
      <div className="mt-5">
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
      </div>
    </div>,
    // 3 — voice test
    <div key="voice">
      <h1 className="font-display text-3xl font-medium tracking-tight">Check your audio</h1>
      <p className="mt-2 text-ink-soft">
        Listening practice speaks words aloud from your device. Press play — if you hear “analysis”, you are set.
      </p>
      <div className="mt-5">
        <Button onClick={() => void testVoice()} loading={voiceState === 'playing'} variant="secondary">
          <Icon name="speaker" size={18} /> Play sample
        </Button>
        {voiceState === 'ok' && <p className="mt-3 text-good">Audio works. Listening practice is enabled.</p>}
        {voiceState === 'unavailable' && (
          <p className="mt-3 text-warn">
            No voice found on this device — listening items will adapt automatically. Everything else works fully.
          </p>
        )}
      </div>
      <Card className="mt-6">
        <p className="font-medium">This is not a flashcard app.</p>
        <p className="mt-2 text-ink-soft">
          Every word is tracked across meaning, recall, listening, spelling, and usage. The system predicts what you
          are about to forget — and tells you why each question appears.
        </p>
      </Card>
    </div>,
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-10">
      <p className="font-display text-xl font-semibold">Lexis</p>
      <div className="mt-6 flex-1">{steps[step]}</div>
      <div className="mt-8 flex items-center justify-between">
        <button onClick={finish} className="cursor-pointer text-sm text-ink-faint hover:text-ink">
          Skip setup
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-faint" aria-hidden>{step + 1} / 5</span>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>
              Continue <Icon name="arrow-right" size={16} />
            </Button>
          ) : (
            <Button onClick={finish}>Begin learning</Button>
          )}
        </div>
      </div>
    </div>
  );
}
