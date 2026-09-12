/** Segmented control with radiogroup semantics (settings, lab options). */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const idx = options.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next !== null && options[next]) {
      e.preventDefault();
      const opt = options[next];
      if (opt) onChange(opt.value);
      // Roving focus: move DOM focus to the newly selected radio.
      const container = e.currentTarget;
      const buttons = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[next]?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" onKeyDown={handleKeyDown}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            title={o.hint}
            className={`min-h-[44px] cursor-pointer rounded-lg border px-4 py-2 text-[15px] transition-calm transition-colors ${
              active
                ? 'border-accent bg-accent-soft font-medium text-accent-deep dark:text-accent'
                : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
