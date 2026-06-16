import type { FavorType } from '../../types';

interface Props {
  type: FavorType;
  size?: number;
}

const FAVOR_EMOJI: Record<FavorType, string> = {
  money: '💰',
  reputation: '⭐',
  card: '🃏',
  servant: '👤',
  tile: '🏗️',
  vp: '🏆',
  penalty: '⚠️',
};

export function FavorIcon({ type, size = 14 }: Props) {
  return (
    <span style={{ fontSize: size }} title={type}>
      {FAVOR_EMOJI[type]}
    </span>
  );
}
