import type { CellState } from '../types';
import './Cell.css';

interface Props {
  state: CellState;
  isToday: boolean;
  isSelected: boolean;
  isOutside?: boolean;
  date: string;
  onHover: (el: HTMLElement | null, date: string) => void;
  onClick: (date: string) => void;
}

export default function Cell({ state, isToday, isSelected, isOutside, date, onHover, onClick }: Props) {
  const classes = [
    'cell', state,
    isToday && 'today',
    isSelected && 'selected',
    isOutside && 'outside',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      aria-label={`${date} · ${state}`}
      onMouseEnter={(e) => onHover(e.currentTarget, date)}
      onMouseLeave={() => onHover(null, '')}
      onClick={() => onClick(date)}
    />
  );
}
