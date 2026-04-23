import { useMemo } from 'react';
import type { CellState, HistoryRecord } from '../types';
import Cell from './Cell';

interface Props {
  year: number;
  today: string;
  selectedDate: string;
  scheduleDays: number[];
  historyMap: Map<string, HistoryRecord>;
  onHover: (el: HTMLElement | null, date: string) => void;
  onClick: (date: string) => void;
}

const DOW_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCellState(iso: string, today: string, scheduleDays: number[], historyMap: Map<string, HistoryRecord>): CellState {
  const rec = historyMap.get(iso);
  if (rec) return rec.status === 'success' ? 'ok' : 'err';
  if (iso > today) {
    const dow = new Date(iso + 'T12:00:00').getDay();
    return scheduleDays.includes(dow) ? 'future-scheduled' : 'future';
  }
  return 'none';
}

export default function WeekView({ year, today, selectedDate, scheduleDays, historyMap, onHover, onClick }: Props) {
  const { cells, monthPositions, numWeeks } = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const start = new Date(jan1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(dec31);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const cells: { iso: string; dow: number; col: number; outside: boolean }[] = [];
    const monthPositions: { label: string; col: number }[] = [];
    const seenMonths = new Set<number>();

    let current = new Date(start);
    let col = 0;

    while (current <= end) {
      const dow = current.getDay();
      if (dow === 0 && cells.length > 0) col++;
      const iso = isoDate(current);
      const outside = current.getFullYear() !== year;
      cells.push({ iso, dow, col, outside });

      if (!outside) {
        const month = current.getMonth();
        if (!seenMonths.has(month)) {
          seenMonths.add(month);
          monthPositions.push({ label: MONTH_LABELS[month], col });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return { cells, monthPositions, numWeeks: col + 1 };
  }, [year]);

  return (
    <div className="week-view">
      <div style={{ display: 'flex', gap: 3, paddingLeft: 36, marginBottom: 4, height: 14 }}>
        {monthPositions.map((m, i) => {
          const nextCol = monthPositions[i + 1]?.col ?? numWeeks;
          const span = nextCol - m.col;
          return (
            <span key={m.label} className="kicker" style={{ width: span * 17, flexShrink: 0, fontSize: 10 }}>
              {m.label}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 36, paddingRight: 6 }}>
          {DOW_LABELS.map(l => (
            <span key={l} className="kicker" style={{ height: 14, lineHeight: '14px', fontSize: 10 }}>{l}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numWeeks}, 14px)`, gridTemplateRows: 'repeat(7, 14px)', gap: 3 }}>
          {cells.map(day => {
            const state = getCellState(day.iso, today, scheduleDays, historyMap);
            return (
              <Cell
                key={day.iso}
                state={state}
                date={day.iso}
                isToday={day.iso === today}
                isSelected={day.iso === selectedDate}
                isOutside={day.outside}
                onHover={onHover}
                onClick={onClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
