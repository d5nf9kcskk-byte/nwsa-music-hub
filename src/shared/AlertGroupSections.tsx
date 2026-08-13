import { useState, type ReactNode } from 'react';
import { ALERT_GROUP_PREVIEW, type AlertGroup } from './groupAlerts';

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
}: {
  groups: AlertGroup<T>[];
  renderItem: (item: T) => ReactNode;
  preview?: number;
  headingClassName?: string;
  sectionClassName?: string;
  moreClassName?: string;
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
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
  preview: number;
  headingClassName: string;
  sectionClassName: string;
  moreClassName: string;
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
          {open ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
