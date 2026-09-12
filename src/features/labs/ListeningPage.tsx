import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionItem, WordRecord } from '../../types/domain';
import { WORDS } from '../../data/words';
import { buildOptions, optionText } from '../../core/engine/distractors';
import { minimalPairPartner, spellingVariants } from '../../core/engine/item-content';
import { getSpeechAvailable } from '../../services/speech';
import { useProgress } from '../../store/progress';
import { useSettings } from '../../store/settings';
import { useSpeak } from '../../components/ui/WordHero';
import { PageHeader } from '../../app/layout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { McqActivity, DictationActivity } from '../session/activities/index';
import { highlightWord } from '../session/activities/highlight';
import { useLabRound } from './useLabRound';
import { mulberry32 } from '../../utils/rng';
import { containsWordOrForm } from '../../utils/text';

type Mode = 'meaning' | 'spelling' | 'pair' | 'dictation' | 'read';

const MODES: { v: Mode; t: string; d: string }[] = [
  { v: 'meaning', t: 'Word → meaning', d: 'Hear the word, choose its meaning' },
  { v: 'spelling', t: 'Word → spelling', d: 'Hear the word, pick the spelling' },
  { v: 'pair', t: 'Which word?', d: 'Hear one of two similar words' },
  { v: 'dictation', t: 'Dictation', d: 'Type the word you hear in its sentence' },
  { v: 'read', t: 'Listen + read', d: 'Audio with the sentence, low pressure' },
];

function introducedWords(): WordRecord[] {
  const words = useProgress.getState().words;
  return WORDS.filter((w) => words[w.id]?.introducedAt);
}

function weakestListening(): WordRecord[] {
  const words = useProgress.getState().words;
  return introducedWords().sort((a, b) =>
    (words[a.id]?.dimensions.listening.strength ?? 0) - (words[b.id]?.dimensions.listening.strength ?? 0),
  );
}

function buildRound(word: WordRecord, mode: Mode, seed: number): { item: SessionItem; speakWord: string; fullSentence: boolean } {
  const rand = mulberry32(seed >>> 0);
  const byId = new Map(WORDS.map((w) => [w.id, w]));
  const base = {
    wordId: word.id, difficulty: 2 as const,
    reason: { kind: 'weak-dimension' as const, humanText: `Listening Lab — extra practice on ${word.word}.` },
  };
  switch (mode) {
    case 'meaning': {
      const options = buildOptions(word, { words: WORDS, byId }, { count: 4, confusionPartners: [], mode: 'meaning', rand });
      return {
        item: { ...base, activity: 'listen-meaning', dimension: 'listening', options, answer: optionText(word, 'meaning') },
        speakWord: word.word, fullSentence: false,
      };
    }
    case 'spelling': {
      const variants = spellingVariants(word.word, 3, rand);
      const options = [...variants, word.word];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [options[i], options[j]] = [options[i]!, options[j]!];
      }
      return {
        item: { ...base, activity: 'listen-spelling', dimension: 'listening', options, answer: word.word },
        speakWord: word.word, fullSentence: false,
      };
    }
    case 'pair': {
      const partner = minimalPairPartner(word, WORDS, [], rand) ?? WORDS[(word.rank) % WORDS.length]!;
      const options = rand() < 0.5 ? [word.word, partner.word] : [partner.word, word.word];
      return {
        item: {
          ...base, activity: 'minimal-pair', dimension: 'listening',
          options, answer: word.word, pairId: partner.id,
        },
        speakWord: word.word, fullSentence: false,
      };
    }
    case 'dictation': {
      return {
        item: { ...base, activity: 'sentence-dictation', dimension: 'listening', answer: word.word, prompt: word.sentence },
        speakWord: word.sentence, fullSentence: false,
      };
    }
    case 'read': {
      return {
        item: { ...base, activity: 'listen-meaning', dimension: 'listening', answer: word.shortDefinition ?? word.word },
        speakWord: word.sentence, fullSentence: false,
      };
    }
  }
}

/**
 * Listening Lab (§10): five activities over the learner's weakest listening
 * words, with persistent speed control. Every round commits a real event.
 */
export default function ListeningPage() {
  const rate = useSettings((s) => s.speechRate);
  const updateSettings = useSettings((s) => s.update);
  const [mode, setMode] = useState<Mode>('meaning');
  const [speechOk, setSpeechOk] = useState<boolean | null>(null);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [fullSentence, setFullSentence] = useState(false);
  const [fullValue, setFullValue] = useState('');
  const [readDone, setReadDone] = useState(false);
  const lab = useLabRound('listening');
  // Re-sorted after every round so practice always targets the current weakest word.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pool = useMemo(() => weakestListening(), [lab.tally.total]);

  useEffect(() => {
    void getSpeechAvailable().then(setSpeechOk);
  }, []);

  useEffect(() => {
    if (pool.length > 0 && !lab.item) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length, mode]);

  const next = (): void => {
    if (pool.length === 0) return;
    const word = pool[(seed + lab.tally.total) % pool.length]!;
    const { item } = buildRound(word, mode, seed + lab.tally.total * 31 + 7);
    setSeed((s) => s + 1);
    setFullValue('');
    setReadDone(false);
    lab.start(item, word);
  };

  if (speechOk === false) {
    return (
      <div>
        <PageHeader title="Listening Lab" sub="Hear it, pin it down." />
        <EmptyState
          title="No voice on this device"
          body="Listening practice needs a speech voice, and this device reports none. Meaning, recall, spelling, and writing practice all work fully — or try another browser."
        />
      </div>
    );
  }

  if (pool.length === 0) {
    return (
      <div>
        <PageHeader title="Listening Lab" sub="Hear it, pin it down." />
        <EmptyState
          title="Meet some words first"
          body="The Listening Lab practices words you've already met. Start a session, then come back to train your ear."
          action={<Link to="/learn" className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 py-2.5 font-medium text-paper">Begin session</Link>}
        />
      </div>
    );
  }

  const item = lab.item;
  const word = lab.word;

  return (
    <div>
      <PageHeader
        title="Listening Lab"
        sub={lab.tally.total > 0 ? `${lab.tally.correct}/${lab.tally.total} correct this visit` : 'Hear it, pin it down.'}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Listening activity"
          value={mode}
          onChange={(v) => setMode(v)}
          options={MODES.map((m) => ({ value: m.v, label: m.t, hint: m.d }))}
        />
      </div>
      <div className="mb-4 flex items-center gap-2 text-sm text-ink-soft">
        <span id="lab-speed">Speed:</span>
        <div role="group" aria-labelledby="lab-speed" className="flex gap-1">
          {([0.75, 0.9, 1] as const).map((r) => (
            <button
              key={r}
              onClick={() => updateSettings({ speechRate: r })}
              aria-pressed={rate === r}
              className={`min-h-[44px] cursor-pointer rounded-lg px-3 transition-calm ${rate === r ? 'bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'hover:text-ink'}`}
            >
              {r}×
            </button>
          ))}
        </div>
        {mode === 'dictation' && (
          <label className="ml-2 inline-flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" checked={fullSentence} onChange={(e) => setFullSentence(e.target.checked)} className="h-5 w-5 accent-[#0f766e]" />
            Type the full sentence (advanced)
          </label>
        )}
      </div>

      {item && word && lab.activityProps && (
        <Card key={lab.roundKey}>
          <p className="mb-1 text-sm text-ink-faint">{MODES.find((m) => m.v === mode)?.d}</p>
          {mode === 'read' ? (
            <ReadMode word={word} lab={lab} readDone={readDone} setReadDone={setReadDone} next={next} />
          ) : mode === 'dictation' && fullSentence ? (
            <FullSentenceDictation word={word} lab={lab} value={fullValue} setValue={setFullValue} next={next} />
          ) : mode === 'dictation' ? (
            <DictationActivity {...lab.activityProps} />
          ) : (
            <McqActivity
              {...lab.activityProps}
              optionWordIds={resolveIds(item, mode !== 'meaning')}
              speakText={mode === 'pair' ? item.answer : word.word}
              autoPlay
            />
          )}
          {lab.phase === 'feedback' && (
            <Button className="mt-4" onClick={next} autoFocus>Next word</Button>
          )}
        </Card>
      )}
    </div>
  );
}

function ReadMode({ word, lab, readDone, setReadDone, next }: {
  word: WordRecord;
  lab: ReturnType<typeof useLabRound>;
  readDone: boolean;
  setReadDone: (v: boolean) => void;
  next: () => void;
}) {
  const { speak, speaking } = useSpeak();
  // The visible sentence is support from round start — count the scaffold hint upfront.
  useEffect(() => {
    lab.activityProps?.noteHint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.roundKey]);
  return (
    <div>
      <p className="text-xl leading-relaxed">{highlightWord(word.sentence, word.word, word.forms ?? [])}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={() => {
          lab.noteReplay();
          void speak(word.sentence);
        }}>
          {speaking ? 'Playing…' : 'Listen while reading'}
        </Button>
        {!readDone ? (
          <Button onClick={() => {
            // Low-stakes reinforcement: scaffolded success (text shown = hinted).
            if (lab.activityProps) labSubmitListened(lab);
            setReadDone(true);
          }}>
            Got it
          </Button>
        ) : (
          <Button onClick={next}>Next word</Button>
        )}
      </div>
      {readDone && <p className="mt-2 text-good">Logged as supported listening practice.</p>}
    </div>
  );
}

function labSubmitListened(lab: ReturnType<typeof useLabRound>): void {
  lab.activityProps?.onSubmit({ correct: true });
}

const BY_WORD = new Map(WORDS.map((w) => [w.word.toLowerCase(), w.id]));
const BY_DEF = new Map(WORDS.map((w) => [(w.shortDefinition ?? '').toLowerCase(), w.id]));

function resolveIds(item: SessionItem, wordMode: boolean): (string | null)[] {
  return (item.options ?? []).map((o) =>
    (wordMode ? BY_WORD.get(o.toLowerCase()) : BY_DEF.get(o.toLowerCase())) ?? null,
  );
}

function FullSentenceDictation({ word, lab, value, setValue, next }: {
  word: WordRecord;
  lab: ReturnType<typeof useLabRound>;
  value: string;
  setValue: (v: string) => void;
  next: () => void;
}) {
  const { speak } = useSpeak();
  const [checked, setChecked] = useState(false);
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const target = norm(word.sentence);
  const correct = checked && norm(value).includes(word.word.toLowerCase()) &&
    norm(value).split(' ').length >= target.split(' ').length - 3;
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button variant="secondary" onClick={() => {
          lab.noteReplay();
          void speak(word.sentence);
        }}>
          Replay sentence
        </Button>
      </div>
      <label htmlFor="full-dictation" className="sr-only">Type the full sentence you hear</label>
      <textarea
        id="full-dictation"
        value={value}
        disabled={checked}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="min-h-[96px] w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-lg transition-calm focus:border-accent focus:outline-none disabled:opacity-70"
        autoCorrect="off" autoCapitalize="off" spellCheck={false} autoComplete="off"
      />
      {!checked ? (
        <Button className="mt-3" disabled={value.trim().split(/\s+/).length < 3} onClick={() => {
          const ok = norm(value).includes(word.word.toLowerCase()) &&
            norm(value).split(' ').length >= target.split(' ').length - 3;
          lab.activityProps?.onSubmit({ correct: ok, typed: value });
          setChecked(true);
        }}>
          Check
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-lg">{correct ? <span className="text-good">Good — full sentence down.</span> : <span>Not yet — compare with the sentence below and listen again.</span>}</p>
          <p className="border-l-2 border-accent pl-3 text-ink-soft">“{word.sentence}”</p>
          <Button onClick={() => { setChecked(false); next(); }}>Next word</Button>
        </div>
      )}
      {word.sentence && !containsWordOrForm(word.sentence, word.word, word.forms ?? []) && (
        <p className="mt-2 text-sm text-warn">This sentence doesn&apos;t contain the word — type what you hear as best you can.</p>
      )}
    </div>
  );
}
