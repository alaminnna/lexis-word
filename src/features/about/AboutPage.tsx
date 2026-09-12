import { useRef } from 'react';
import { PageHeader } from '../../app/layout';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';

/** Brand + developer page — Lexis identity and who built it. Photo + pointer interaction. */
const PROFILE_LINKS: { label: string; href: string; hint: string }[] = [
  { label: 'Website', href: 'https://alaminnna.ami.bd', hint: 'alaminnna.ami.bd' },
  { label: 'GitHub', href: 'https://github.com/alaminnna', hint: '@alaminnna' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/alaminnna/', hint: '@alaminnna' },
  { label: 'YouTube', href: 'https://www.youtube.com/@alaminnna', hint: '@alaminnna' },
  { label: 'Instagram', href: 'https://www.instagram.com/alaminnna', hint: '@alaminnna' },
  { label: 'Threads', href: 'https://www.threads.net/@alaminnna', hint: '@alaminnna' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@alaminnnna', hint: '@alaminnnna' },
  { label: 'Facebook Page', href: 'https://www.facebook.com/profile.php?id=61592578435860', hint: 'Follow' },
  { label: 'Medium', href: 'https://medium.com/@Alaminnna', hint: '@Alaminnna' },
  { label: 'DEV', href: 'https://dev.to/alaminnna', hint: '@alaminnna' },
  { label: 'Hashnode', href: 'https://hashnode.com/@alaminnna', hint: '@alaminnna' },
  { label: 'Product Hunt', href: 'https://www.producthunt.com/@alaminnna', hint: '@alaminnna' },
  { label: 'Stack Overflow', href: 'https://stackoverflow.com/users/33006113/alaminnna', hint: '@alaminnna' },
  { label: 'npm', href: 'https://www.npmjs.com/~alaminnna', hint: '~alaminnna' },
  { label: 'Pinterest', href: 'https://www.pinterest.com/alaminnnnna/', hint: '@alaminnnnna' },
  { label: 'Linktree', href: 'https://linktr.ee/alaminnna', hint: 'All links' },
];

const POSITIONING = [
  'AI Developer',
  'Full Stack Web Developer',
  'Student',
  'Entrepreneur',
  'Open Source Builder',
];

const FEATURES = ['Today', 'Learn', 'Review', 'Roadmap', 'Library', 'Labs', 'Writing Studio', 'Insights'];

/**
 * Pointer-driven 3D tilt + spotlight. Direct DOM writes (no re-render per move),
 * skipped for reduced-motion and coarse pointers.
 */
function DeveloperCard() {
  const tiltRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = tiltRef.current;
    if (!el) return;
    if (e.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg)`;
    el.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
  };

  const handleLeave = (): void => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div style={{ perspective: '1000px' }}>
      <div
        ref={tiltRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        className="transition-calm will-change-transform"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <Card className="relative space-y-3 overflow-hidden">
          {/* Spotlight that follows the pointer */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(420px circle at var(--mx, 50%) var(--my, 20%), rgb(45 212 191 / 0.14), transparent 65%)',
            }}
          />
          <p className="relative text-xs font-medium tracking-wide text-ink-faint uppercase">Developer</p>
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Photo pops in Z for depth on desktop; full-width banner on phone */}
            <div className="w-full shrink-0 overflow-hidden rounded-2xl border border-line-strong bg-paper-deep shadow-sm sm:w-auto sm:[transform:translateZ(36px)]">
              <img
                src="/images/al-a-min-alaminnna.jpg"
                alt="Al A Min (Alaminnna) by a river in Bangladesh, looking at the water."
                width={768}
                height={448}
                loading="lazy"
                decoding="async"
                className="h-56 w-full object-cover object-[60%_25%] transition-calm hover:scale-105 sm:h-52 sm:w-44"
              />
            </div>
            <div className="min-w-0 space-y-2" style={{ transform: 'translateZ(18px)' }}>
              <div>
                <h2 className="font-display text-xl font-medium">Al A Min (Alaminnna)</h2>
                <p className="mt-0.5 text-ink-soft">Dhaka, Bangladesh</p>
              </div>
              <p className="text-[15px] text-ink-soft">
                I build in the open — small tools, honest progress, no hype.
                Lexis is one of those builds: a calm place to learn IELTS words properly.
              </p>
              <a
                href="https://alaminnna.ami.bd"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 font-medium text-accent-deep underline transition-calm hover:gap-3 dark:text-accent"
              >
                <Icon name="globe" size={18} />
                alaminnna.ami.bd
              </a>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2">
            {POSITIONING.map((role, i) => (
              <span
                key={role}
                className="animate-rise rounded-full bg-accent-soft px-3 py-1 text-sm text-accent-deep transition-calm hover:scale-105 dark:text-accent"
                style={{ animationDelay: `${220 + i * 60}ms` }}
              >
                {role}
              </span>
            ))}
          </div>
          <p className="relative hidden text-xs text-ink-faint [@media(pointer:fine)]:block">
            Move your pointer over this card — it follows you.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <div className="animate-fade">
        <PageHeader title="About" sub="The Lexis brand — and the developer behind it." />
      </div>

      {/* Brand */}
      <div className="animate-rise" style={{ animationDelay: '60ms' }}>
        <Card className="relative space-y-3 overflow-hidden transition-calm hover:-translate-y-0.5">
          {/* Animated ambient wash — decorative only */}
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/15 blur-3xl animate-orb" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl animate-orb" style={{ animationDelay: '1.2s' }} />
          <p className="relative font-display text-2xl font-semibold tracking-tight">Lexis</p>
          <p className="relative text-ink-soft">
            IELTS Academic vocabulary app · 499 words. Offline-first — everything
            lives on your device. Study a little every day: Today plans it, Learn
            teaches it, Review keeps it, Roadmap shows the 10 stages.
          </p>
          <div className="relative flex flex-wrap gap-2 text-sm">
            {FEATURES.map((f, i) => (
              <span
                key={f}
                className="animate-rise rounded-full border border-line bg-paper-deep px-3 py-1 text-ink-soft transition-calm hover:border-accent hover:text-ink"
                style={{ animationDelay: `${150 + i * 50}ms` }}
              >
                {f}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Developer — pointer-interactive */}
      <div className="animate-rise" style={{ animationDelay: '140ms' }}>
        <DeveloperCard />
      </div>

      {/* Connect */}
      <div className="animate-rise" style={{ animationDelay: '220ms' }}>
        <Card className="space-y-3">
          <h2 className="font-display text-xl">Connect</h2>
          <p className="-mt-2 text-sm text-ink-soft">Find me around the web as @alaminnna.</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROFILE_LINKS.map((link, i) => (
              <li
                key={link.label}
                className="animate-rise"
                style={{ animationDelay: `${280 + Math.min(i, 8) * 50}ms` }}
              >
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 transition-calm hover:-translate-y-0.5 hover:border-accent hover:shadow-sm"
                >
                  <span className="font-medium">{link.label}</span>
                  <span className="truncate text-sm text-ink-faint">{link.hint}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-faint">Still working on it — more coming.</p>
        </Card>
      </div>
    </div>
  );
}
