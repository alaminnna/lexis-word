import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Non-blocking notice banner (API offline, quota, resume offers live elsewhere). */
export function Banner({ tone = 'info', children, onDismiss, className = '' }: {
  tone?: 'info' | 'warn';
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const icon: IconName = tone === 'warn' ? 'alert' : 'info';
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-[15px] transition-calm motion-safe:starting:opacity-0 motion-safe:starting:-translate-y-1 ${
        tone === 'warn' ? 'border-warn/30 bg-warn-soft text-ink' : 'border-line bg-paper-deep text-ink-soft'
      } ${className}`}
    >
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss notice"
          className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded text-ink-soft hover:text-ink"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
