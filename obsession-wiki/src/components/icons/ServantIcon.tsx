import type { ServantType } from '../../types';

interface Props {
  type: ServantType;
  size?: number;
  className?: string;
}

const SERVANT_EMOJI: Record<ServantType, string> = {
  butler: '🎩',
  valet: '🪆',
  ladysmaid: '👒',
  housekeeper: '🗝️',
  footman: '🧤',
  underbutler: '🎭',
  cook: '👨‍🍳',
  hallboy: '🧹',
  headhousemaid: '🪡',
  usefulman: '🔧',
};

export function ServantIcon({ type, size = 24, className }: Props) {
  return (
    <span style={{ fontSize: size * 0.7, lineHeight: 1 }} className={className} title={type}>
      {SERVANT_EMOJI[type]}
    </span>
  );
}
