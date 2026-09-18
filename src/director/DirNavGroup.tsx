import { ChevronDown } from 'lucide-react';
import { ensembleColor } from './utils';
import type { Ensemble } from './types';
import type { DirTab, DirNavOpts } from './types-nav';

/**
 * ONE renderer for the director shell's Ensembles / Classes / College groups
 * (#one-nav).
 *
 * The desktop rail and the phone drawer used to write these three groups out
 * TWICE, by hand, ~300 lines apart in DirectorApp.tsx — and they had already
 * drifted: the drawer's "All Classes" row carried the GraduationCap (College's
 * icon) while the rail's carried BookOpen, and the rail highlighted the
 * Ensembles heading on the All-Ensembles tab while the drawer did not. Neither
 * is visible to whoever is looking, because only one of the two is on screen at
 * any width. That is the same shape as the bug that hid "College" from every
 * phone on the student site.
 *
 * What legitimately differs between the two surfaces is class names and icon
 * sizes, and that lives in SKINS below. A new per-surface difference goes
 * there. Never an `if (rail)` in the markup, and never a second copy of a row.
 */

type Skin = {
  head: string;
  item: string;
  dot: string;
  /** The rail's headings are small uppercase labels; the drawer's are rows. */
  headIcon: boolean;
  headIconSize: number;
  chevron: number;
  /** The drawer pushes its chevron over; the rail's head is space-between. */
  chevronAuto: boolean;
  allIconSize: number;
};

const RAIL: Skin = {
  head: 'dir-rail-head dir-rail-expand',
  item: 'dir-rail-item',
  dot: 'dir-rail-dot',
  headIcon: false,
  headIconSize: 18,
  chevron: 14,
  chevronAuto: false,
  allIconSize: 18,
};

const DRAWER: Skin = {
  head: 'dir-menu-item',
  item: 'dir-menu-item dir-menu-subitem',
  dot: 'dir-menu-dot',
  headIcon: true,
  headIconSize: 19,
  chevron: 16,
  chevronAuto: true,
  allIconSize: 16,
};

type IconType = typeof ChevronDown;

export type DirNavGroupSpec = {
  key: string;
  label: string;
  /** Drawn on the drawer's heading row; the rail's heading is text only. */
  Icon: IconType;
  /** Heading highlights when the open tab belongs to this group. */
  headActive: boolean;
  open: boolean;
  toggle: () => void;
  /** The group's own hub screen — "All Ensembles", "All Classes", "College Hub". */
  all: { tab: DirTab; label: string; Icon: IconType };
  /** Every group in the list, in order. College concatenates its ensembles
   *  and its classes, which is exactly what both surfaces already rendered. */
  items: Ensemble[];
};

export function DirNavGroup({
  group,
  rail,
  tab,
  activeEnsembleId,
  go,
}: {
  group: DirNavGroupSpec;
  rail?: boolean;
  tab: DirTab;
  activeEnsembleId?: string;
  go: (t: DirTab, opts?: DirNavOpts) => void;
}) {
  const skin = rail ? RAIL : DRAWER;
  const { label, Icon, headActive, open, toggle, all, items } = group;

  return (
    <>
      <button
        type="button"
        className={`${skin.head} ${headActive ? 'active' : ''}`}
        onClick={toggle}
        aria-expanded={open}
      >
        {skin.headIcon && <Icon size={skin.headIconSize} />}
        {label}
        <ChevronDown
          size={skin.chevron}
          style={{
            marginLeft: skin.chevronAuto ? 'auto' : undefined,
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.15s',
          }}
        />
      </button>
      {open && (
        <>
          <button
            className={`${skin.item} ${tab === all.tab ? 'active' : ''}`}
            onClick={() => go(all.tab)}
            aria-current={tab === all.tab ? 'page' : undefined}
          >
            <all.Icon size={skin.allIconSize} /> {all.label}
          </button>
          {items.map(e => (
            <button
              key={e.id}
              className={`${skin.item} ${tab === 'ensembleHub' && activeEnsembleId === e.id ? 'active' : ''}`}
              onClick={() => go('ensembleHub', { ensembleId: e.id })}
              aria-current={tab === 'ensembleHub' && activeEnsembleId === e.id ? 'page' : undefined}
            >
              <span className={skin.dot} style={{ background: ensembleColor(e) }} /> {e.name}
            </button>
          ))}
        </>
      )}
    </>
  );
}
