/** Segmented control with radiogroup semantics (settings, lab options). */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
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
