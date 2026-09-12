import type { ReactNode } from 'react';

/** Quiet surface card — warm paper, hairline border, no shadows-as-decoration. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-paper p-5 ${className}`}>
      {children}
    </section>
  );
}
