import { Link } from 'react-router-dom';
import { drillableEdges } from '../../core/engine/confusion';
import { useProgress } from '../../store/progress';
import { PageHeader } from '../../app/layout';
import { Icon, type IconName } from '../../components/ui/Icon';

const LABS: { to: string; icon: IconName; t: string; d: string; status: () => string | null }[] = [
  {
    to: '/labs/listening', icon: 'headphones', t: 'Listening Lab',
    d: 'Word → meaning, word → spelling, minimal pairs, sentence dictation, listen-while-read.',
    status: () => null,
  },
  {
    to: '/labs/spelling', icon: 'type', t: 'Spelling Lab',
    d: 'Six-rung ladder: chunks, letter bank, hinted typing, flash typing, dictation, meaning → spell.',
    status: () => null,
  },
  {
    to: '/labs/discrimination', icon: 'swap', t: 'Discrimination Trainer',
    d: 'Side-by-side comparison cards and rapid interleaved drills for confused pairs.',
    status: () => {
      const n = drillableEdges(useProgress.getState().confusion).length;
      return n > 0 ? `${n} pair${n === 1 ? '' : 's'} waiting for a drill` : null;
    },
  },
];

/** Labs hub — the rail's "Labs" entry (§17). */
export default function LabsPage() {
  return (
    <div>
      <PageHeader title="Labs" sub="Dedicated practice spaces. Everything here trains your real memory model." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {LABS.map((l) => {
          const status = l.status();
          return (
            <Link
              key={l.to}
              to={l.to}
              className="group flex flex-col gap-2 rounded-xl border border-line p-5 transition-calm hover:border-accent"
            >
              <Icon name={l.icon} size={26} className="text-ink-soft group-hover:text-accent-deep dark:group-hover:text-accent" />
              <span className="font-display text-xl">{l.t}</span>
              <span className="text-[15px] text-ink-soft">{l.d}</span>
              {status && <span className="text-sm font-medium text-warn">{status}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
