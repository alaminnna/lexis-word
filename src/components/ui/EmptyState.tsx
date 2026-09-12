import type { ReactNode } from 'react';

/** Loading / empty / error states — every page defines all three (§17). */
export function EmptyState({ title, body, action }: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="font-display text-2xl">{title}</p>
      {body && <p className="max-w-md text-ink-soft">{body}</p>}
      {action}
    </div>
  );
}
