import { useState, type ReactNode } from 'react';
import { ALERT_GROUP_PREVIEW, type AlertGroup } from './groupAlerts';

export interface MoreLabels {
  fewer: string;
  all: (count: number) => string;
}

const ENGLISH_LABELS: MoreLabels = {
  fewer: 'Show fewer',
  all: count => `Show all ${count}`,
};

/**
 * Renders alert groups with headings; shows the first N cards, then "Show all".
 * Each item stays a separate card via `renderItem`.
 */
export function AlertGroupSections<T>({
  groups,
  renderItem,
  preview = ALERT_GROUP_PREVIEW,
  headingClassName = 'pub-alert-group-title',
  sectionClassName = 'pub-alert-group',
  moreClassName = 'pub-alert-group-more',
  labels = ENGLISH_LABELS,
}: {
  groups: AlertGroup<T>[];
  renderItem: (item: T) => ReactNode;
  preview?: number;
  headingClassName?: string;
  sectionClassName?: string;
  moreClassName?: string;
  /** The show-more button's words. English by default (the director shell);
   *  the public site passes translated ones. */
  labels?: MoreLabels;
}) {
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map(g => (
        <AlertGroupSection
          key={g.key}
          title={g.title}
          items={g.items}
          renderItem={renderItem}
          preview={preview}
          headingClassName={headingClassName}
          sectionClassName={sectionClassName}
          moreClassName={moreClassName}
          labels={labels}
        />
      ))}
    </>
  );
}

function AlertGroupSection<T>({
  title,
  items,
  renderItem,
  preview,
  headingClassName,
  sectionClassName,
  moreClassName,
  labels,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
  preview: number;
  headingClassName: string;
  sectionClassName: string;
  moreClassName: string;
  labels: MoreLabels;
}) {
  const [open, setOpen] = useState(false);
  const hidden = items.length - preview;
  const visible = open || hidden <= 0 ? items : items.slice(0, preview);

  return (
    <div className={sectionClassName}>
      <div className={headingClassName}>{title}</div>
      {visible.map(renderItem)}
      {hidden > 0 && (
        <button
          type="button"
          className={moreClassName}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
        >
          {open ? labels.fewer : labels.all(items.length)}
        </button>
      )}
    </div>
  );
}
