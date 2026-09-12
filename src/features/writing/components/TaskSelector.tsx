import type { WritingTaskKind } from '../writingSelectors';

const TASKS: { value: WritingTaskKind; title: string; body: string }[] = [
  { value: 'frame', title: 'Guided Frame', body: 'Complete the sentence with its natural partner.' },
  { value: 'transform', title: 'Register Transformation', body: 'Rewrite informal into academic.' },
  { value: 'free', title: 'Free Production', body: 'Write original Task-2-ready sentences.' },
];

/** Compact task-type selector (§4.C) — segmented, keyboard-operable, described. */
export function TaskSelector({ value, onChange }: {
  value: WritingTaskKind;
  onChange: (t: WritingTaskKind) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Writing task type" className="grid grid-cols-3 gap-2">
      {TASKS.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="radio"
            aria-checked={active}
            title={t.body}
            onClick={() => onChange(t.value)}
            className={`min-h-[56px] cursor-pointer rounded-xl border px-2 py-2 text-center transition-calm transition-colors ${
              active
                ? 'border-accent bg-accent-soft'
                : 'border-line hover:border-line-strong'
            }`}
          >
            <span className={`block text-[15px] ${active ? 'font-medium text-accent-deep dark:text-accent' : ''}`}>{t.title}</span>
            <span className="mt-0.5 hidden text-xs text-ink-soft sm:block">{t.body}</span>
          </button>
        );
      })}
    </div>
  );
}
