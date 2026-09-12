import { useState } from 'react';
import { useSettings } from '../../store/settings';
import { Icon } from './Icon';

/**
 * Bengali gloss with the display-policy applied (§5 scaffolding removal):
 * always · on-demand (tap to reveal — forces a retrieval attempt first) ·
 * fade (auto-hides as recall strength rises).
 */
export function BengaliText({ bengali, recallStrength = 0, className = '' }: {
  bengali?: string | string[];
  recallStrength?: number;
  className?: string;
}) {
  const policy = useSettings((s) => s.bengaliPolicy);
  const [revealed, setRevealed] = useState(false);
  if (!bengali || (Array.isArray(bengali) && bengali.length === 0)) return null;
  const text = Array.isArray(bengali) ? bengali.join(' · ') : bengali;

  const visible = policy === 'always' || (policy === 'fade' && recallStrength < 50) || revealed;
  if (visible) {
    return <p lang="bn" className={`font-bengali text-[17px] leading-relaxed text-ink-soft ${className}`}>{text}</p>;
  }
  return (
    <button
      onClick={() => setRevealed(true)}
      className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-ink-faint transition-calm hover:border-accent hover:text-accent-deep dark:hover:text-accent"
    >
      <Icon name="eye" size={16} />
      <span lang="bn" className="font-bengali">বাংলা দেখুন</span>
      <span className="sr-only">Reveal Bengali meaning</span>
    </button>
  );
}
