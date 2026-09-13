import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { startPersistence, flushAll } from '../store/persist';
import { useSettings } from '../store/settings';
import { dictionary, type ApiStatus } from '../services/dictionary';
import { hasSeedFiles, seedDictionaryCache } from '../services/dict-seed';
import { Banner } from '../components/ui/Banner';
import { Icon, type IconName } from '../components/ui/Icon';

/** Desktop left rail (spec §16) + mobile bottom tab bar with a More sheet. */
const RAIL: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Today', icon: 'home', end: true },
  { to: '/learn', label: 'Learn', icon: 'play' },
  { to: '/review', label: 'Review', icon: 'target' },
  { to: '/roadmap', label: 'Roadmap', icon: 'layers' },
  { to: '/library', label: 'Library', icon: 'book' },
  { to: '/labs', label: 'Labs', icon: 'headphones' },
  { to: '/writing', label: 'Writing', icon: 'pen' },
  { to: '/insights', label: 'Insights', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'sliders' },
  { to: '/about', label: 'About', icon: 'info' },
];

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Today', icon: 'home', end: true },
  { to: '/learn', label: 'Learn', icon: 'play' },
  { to: '/review', label: 'Review', icon: 'target' },
  { to: '/roadmap', label: 'Roadmap', icon: 'layers' },
];

function ApiBanner() {
  const [status, setStatus] = useState<ApiStatus>(dictionary.getStatus());
  const [dismissed, setDismissed] = useState(false);
  const [seedOffer, setSeedOffer] = useState(false);
  const [seeding, setSeeding] = useState(false);
  useEffect(() => dictionary.onStatusChange(setStatus), []);
  useEffect(() => {
    // Seed files ship with the app (public/dict-seed → /dict-seed/*.json),
    // so offer the one-click offline load anywhere it is reachable — dev and
    // production alike. Previously DEV-gated, which hid the button on Vercel.
    if (status === 'unavailable') {
      void hasSeedFiles().then((has) => {
        if (has) setSeedOffer(true);
      });
    }
  }, [status]);
  if (status !== 'unavailable' || dismissed) return null;
  const seedNow = (): void => {
    setSeeding(true);
    void seedDictionaryCache().then(({ done, errors }) => {
      dictionary.noteCacheSeeded(done - errors);
      setSeeding(false);
      setDismissed(true); // enrichment now serves from cache; no more banner
    });
  };
  return (
    <Banner tone="info" onDismiss={() => setDismissed(true)}>
      Enriched dictionary data is offline — studying continues normally with your local word data.
      {seedOffer && (
        <span className="mt-2 block">
          <button
            onClick={seedNow}
            disabled={seeding}
            className="cursor-pointer font-medium text-accent-deep underline disabled:opacity-60 dark:text-accent"
          >
            {seeding ? 'Loading offline seed…' : 'Or load the offline seed (499 words, one click)'}
          </button>
        </span>
      )}
    </Banner>
  );
}

function QuotaNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event): void => {
      const action = (e as CustomEvent<{ action: string }>).detail?.action ?? '';
      setNotice(
        action === 'cache-pruned'
          ? 'Storage is full — cleared cached dictionary data. Your progress is safe.'
          : action === 'events-compacted'
            ? 'Storage is full — compacted old activity history into daily totals. Your progress is safe.'
            : action === 'progress-corrupt'
              ? 'Saved progress looked corrupt, so we started fresh — a backup was kept on this device. Export from Settings if this repeats.'
              : 'Storage is full and cannot free more space. Export your data from Settings to be safe.',
      );
    };
    window.addEventListener('lexis:quota-notice', handler);
    return () => window.removeEventListener('lexis:quota-notice', handler);
  }, []);
  if (!notice) return null;
  return <Banner tone="warn" onDismiss={() => setNotice(null)}>{notice}</Banner>;
}

function MoreSheet({ open, onClose, returnRef }: { open: boolean; onClose: () => void; returnRef: React.RefObject<HTMLButtonElement | null> }) {
  const firstRef = useState(() => ({ current: null as HTMLAnchorElement | null }))[0];
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      // Simple focus trap: keep Tab inside the sheet.
      if (e.key === 'Tab') {
        const root = document.getElementById('more-sheet');
        if (!root) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    // Move focus in, return focus on close.
    const t = setTimeout(() => firstRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      returnRef.current?.focus();
    };
  }, [open, onClose, firstRef, returnRef]);
  if (!open) return null;
  const items = RAIL.slice(4);
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More sections">
      <div aria-hidden className="absolute inset-0 bg-ink/30 transition-calm motion-safe:starting:opacity-0" onClick={onClose} />
      <nav id="more-sheet" aria-label="More sections" className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-paper p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-transform duration-250 ease-[cubic-bezier(0.33,1,0.68,1)] motion-safe:starting:translate-y-full">
        <div className="grid grid-cols-2 gap-2">
          {items.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              ref={i === 0 ? firstRef as React.Ref<HTMLAnchorElement> : undefined}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-[15px] hover:bg-paper-deep ${
                  isActive ? 'bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'text-ink'
                }`
              }
            >
              <Icon name={item.icon} size={20} className="text-ink-soft" />
              {item.label}
            </NavLink>
          ))}
        </div>
        <button onClick={onClose} className="mt-2 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-lg text-sm text-ink-soft">
          Close
        </button>
      </nav>
    </div>
  );
}

function RailLink({ to, label, icon, end }: { to: string; label: string; icon: IconName; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-calm ${
          isActive ? 'bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'
        }`
      }
    >
      <Icon name={icon} size={20} />
      {label}
    </NavLink>
  );
}

export function AppLayout() {
  const theme = useSettings((s) => s.theme);
  const displayName = useSettings((s) => s.displayName);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();
  const moreActive = RAIL.slice(4).some((r) =>
    r.end ? location.pathname === r.to : location.pathname === r.to || location.pathname.startsWith(`${r.to}/`),
  );
  // Writing Studio lays out an editor + guidance column side by side, so it
  // gets a wider column than the reading-focused max-w-3xl pages.
  const wide = location.pathname === '/writing' || location.pathname.startsWith('/writing/');

  useEffect(() => {
    startPersistence();
    return () => flushAll();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141A22' : '#FAF9F6');
  }, [theme]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      {/* Desktop left rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-1 overflow-y-auto border-r border-line bg-paper px-4 py-6 md:flex" aria-label="Primary">
        <Link to="/" className="mb-4 px-3 font-display text-2xl font-semibold tracking-tight" aria-label="Lexis home">
          Lexis
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {RAIL.map((item) => (
            <RailLink key={item.to} {...item} />
          ))}
        </nav>
        <p className="mt-auto px-3 pt-6 text-xs text-ink-soft">
          {displayName ? `${displayName} · ` : ''}IELTS Academic · 499 words
        </p>
      </aside>

      <div className="md:pl-60">
        <div className={`mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'} space-y-3 px-4 pt-4 pb-28 md:pb-12`}>
          <ApiBanner />
          <QuotaNotice />
          <main id="main">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid grid-cols-5">
          {TABS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[56px] cursor-pointer flex-col items-center justify-center gap-1 text-xs ${
                  isActive ? 'font-medium text-accent-deep dark:text-accent' : 'text-ink-soft'
                }`
              }
            >
              <Icon name={item.icon} size={22} />
              {item.label}
            </NavLink>
          ))}
          <button
            ref={moreBtnRef}
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreActive ? 'page' : undefined}
            className={`flex min-h-[56px] cursor-pointer flex-col items-center justify-center gap-1 text-xs ${
              moreActive ? 'font-medium text-accent-deep dark:text-accent' : 'text-ink-soft'
            }`}
          >
            <Icon name="menu" size={22} />
            More
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} returnRef={moreBtnRef} />
    </div>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
      {sub && <div className="mt-1 text-ink-soft">{sub}</div>}
    </header>
  );
}
