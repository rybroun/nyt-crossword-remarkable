import { useMemo } from 'react';
import type { CellState, HistoryRecord } from '../types';
import Cell from './Cell';

interface Props {
  year: number; dow: number; today: string; selectedDate: string;
  scheduleDays: number[];
  historyMap: Map<string, HistoryRecord>;
  onHover: (el: HTMLElement | null, date: string) => void;
  onClick: (date: string) => void;
}

const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const ORD_LABELS = ['1ST', '2ND', '3RD', '4TH', '5TH'];

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
    const d = new Date(iso + 'T12:00:00').getDay();
    return scheduleDays.includes(d) ? 'future-scheduled' : 'future';
  }
  return 'none';
}

export default function DowView({ year, dow, today, selectedDate, scheduleDays, historyMap, onHover, onClick }: Props) {
  const grid = useMemo(() => {
    const result: (string | null)[][] = Array.from({ length: 12 }, () => []);
    for (let month = 0; month < 12; month++) {
      const d = new Date(year, month, 1);
      while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
      while (d.getMonth() === month) {
        result[month].push(isoDate(d));
        d.setDate(d.getDate() + 7);
      }
      while (result[month].length < 5) result[month].push(null);
    }
    return result;
  }, [year, dow]);

  return (
    <div className="dow-view">
      <div style={{ display: 'flex', gap: 3, paddingLeft: 36, marginBottom: 4, height: 14 }}>
        {MONTH_SHORT.map(m => (
          <span key={m} className="kicker" style={{ width: 14, textAlign: 'center', fontSize: 10 }}>{m}</span>
        ))}
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 36, paddingRight: 6 }}>
          {ORD_LABELS.map(l => (
            <span key={l} className="kicker" style={{ height: 14, lineHeight: '14px', fontSize: 10 }}>{l}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 14px)', gridTemplateRows: 'repeat(5, 14px)', gap: 3 }}>
          {Array.from({ length: 5 }, (_, row) =>
            grid.map((month, col) => {
              const iso = month[row];
              if (!iso) return <div key={`${col}-${row}`} style={{ width: 14, height: 14 }} />;
              const state = getCellState(iso, today, scheduleDays, historyMap);
              return (
                <Cell key={iso} state={state} date={iso}
                  isToday={iso === today} isSelected={iso === selectedDate}
                  onHover={onHover} onClick={onClick} />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
