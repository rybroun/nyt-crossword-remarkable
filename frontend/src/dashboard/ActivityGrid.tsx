import { useState } from 'react';
import type { HistoryRecord, CellState } from '../types';
import WeekView from './WeekView';
import DowView from './DowView';
import CellTip from './CellTip';
import Legend from './Legend';
import './ActivityGrid.css';

interface Props {
  view: 'week' | 'dayofweek';
  year: number; dow: number; today: string; selectedDate: string;
  scheduleDays: number[]; history: HistoryRecord[];
  onCellClick: (date: string) => void;
}

export default function ActivityGrid({ view, year, dow, today, selectedDate, scheduleDays, history, onCellClick }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; date: string } | null>(null);
  const historyMap = new Map(history.map(r => [r.puzzle_date, r]));

  const handleHover = (el: HTMLElement | null, date: string) => {
    if (!el) { setTip(null); return; }
    const rect = el.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top, date });
  };

  const tipRecord = tip ? historyMap.get(tip.date) : undefined;
  const tipState: CellState = tip ? (
    tipRecord ? (tipRecord.status === 'success' ? 'ok' : 'err') :
    tip.date > today ? (scheduleDays.includes(new Date(tip.date + 'T12:00:00').getDay()) ? 'future-scheduled' : 'future') :
    'none'
  ) : 'none';

  return (
    <div className="activity-grid">
      {view === 'week' && (
        <WeekView year={year} today={today} selectedDate={selectedDate}
          scheduleDays={scheduleDays} historyMap={historyMap}
          onHover={handleHover} onClick={onCellClick} />
      )}
      {view === 'dayofweek' && (
        <DowView year={year} dow={dow} today={today} selectedDate={selectedDate}
          scheduleDays={scheduleDays} historyMap={historyMap}
          onHover={handleHover} onClick={onCellClick} />
      )}
      {tip && <CellTip x={tip.x} y={tip.y} date={tip.date} state={tipState} record={tipRecord} />}
      <Legend />
    </div>
  );
}
