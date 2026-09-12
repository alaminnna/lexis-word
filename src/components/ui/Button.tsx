import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { uiTapFeedback } from '../../services/feedback';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-paper hover:brightness-110 active:brightness-95 disabled:bg-line disabled:text-ink-faint',
  secondary: 'border border-line-strong text-ink hover:border-accent hover:text-accent-deep dark:hover:text-accent active:bg-accent-soft disabled:opacity-50',
  ghost: 'text-ink-soft hover:text-ink hover:bg-paper-deep active:bg-line disabled:opacity-50',
  danger: 'border border-bad/40 text-bad hover:bg-bad-soft active:brightness-95 disabled:opacity-50',
};

/**
 * Lexis button — calm, single accent, ≥44px targets. States: default · hover ·
 * focus-visible (global ring) · active · disabled · loading (aria-busy).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
}>(function Button({ variant = 'primary', loading = false, className = '', disabled, children, onClick, ...rest }, ref) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    // Global UI-tap sound lives here so every button honors the setting;
    // the feedback module no-ops unless the learner opted in.
    uiTapFeedback();
    onClick?.(e);
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[15px] font-medium transition-calm transition-colors ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});
