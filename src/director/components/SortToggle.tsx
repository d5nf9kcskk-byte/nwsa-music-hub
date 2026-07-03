import { ArrowDownAZ, ListMusic } from 'lucide-react';
import type { StudentSort } from '../scoreOrder';

/** Compact "Last name | Score order" sort switch used wherever students are listed. */
export function SortToggle({ value, onChange }: { value: StudentSort; onChange: (v: StudentSort) => void }) {
  return (
    <div className="dir-sort-toggle" role="group" aria-label="Sort students">
      <button
        className={`dir-sort-btn ${value === 'lastName' ? 'active' : ''}`}
        onClick={() => onChange('lastName')}
      >
        <ArrowDownAZ size={14} /> Last name
      </button>
      <button
        className={`dir-sort-btn ${value === 'scoreOrder' ? 'active' : ''}`}
        onClick={() => onChange('scoreOrder')}
      >
        <ListMusic size={14} /> Score order
      </button>
    </div>
  );
}
