import type { TileCategory } from '../../types';

interface Props {
  category: TileCategory;
  size?: number;
}

const CATEGORY_EMOJI: Record<TileCategory, string> = {
  essential: '🏠',
  service: '🔔',
  estate: '🌳',
  prestige: '👑',
  sporting: '🏇',
  monument: '🏛️',
};

export function CategoryIcon({ category, size = 20 }: Props) {
  return (
    <span style={{ fontSize: size * 0.75 }} title={category}>
      {CATEGORY_EMOJI[category]}
    </span>
  );
}
