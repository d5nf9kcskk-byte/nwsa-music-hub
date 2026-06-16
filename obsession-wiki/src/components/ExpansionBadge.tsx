import type { Expansion } from '../types';

interface Props {
  expansion: Expansion | 'all';
  size?: 'sm' | 'md';
}

const EXPANSION_LABELS: Record<Expansion | 'all', string> = {
  base: 'Base Game',
  wessex: 'Wessex',
  'upstairs-downstairs': 'Upstairs/Downstairs',
  characters: 'Characters',
  'useful-box': 'Useful Box',
  promo: 'Promo',
  all: 'All',
};

export function ExpansionBadge({ expansion, size = 'sm' }: Props) {
  return (
    <span className={`expansion-badge ${expansion} ${size}`}>
      {EXPANSION_LABELS[expansion]}
    </span>
  );
}
