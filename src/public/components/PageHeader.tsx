import type { ReactNode } from 'react';

/**
 * Shared page header: one title treatment across every public page (Home
 * keeps its richer hero on purpose). `action` renders right-aligned — a view
 * toggle, a print button — and `intro` is the one-line explainer under it.
 */
export function PageHeader({ title, action, intro }: {
  title: ReactNode;
  action?: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <>
      <div className="pub-pagehead">
        <h1 className="pub-h1">{title}</h1>
        {action}
      </div>
      {intro && <p className="pub-page-intro">{intro}</p>}
    </>
  );
}

/** Shimmer placeholders shaped like the cards that are about to load. */
export function SkeletonCards({ n = 3, slim = false }: { n?: number; slim?: boolean }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`pub-skeleton-card${slim ? ' slim' : ''}`} />
      ))}
    </div>
  );
}

/** One designed empty state everywhere: icon + line + optional next action. */
export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="pub-empty">
      {icon}
      <div className="pub-empty-text">{children}</div>
    </div>
  );
}
