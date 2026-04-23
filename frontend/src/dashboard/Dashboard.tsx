import { useState, useEffect } from 'react';
import type { HistoryRecord, ScheduleConfig, FetchState } from '../types';
import { api } from '../api';
import GridToolbar from './GridToolbar';
import ActivityGrid from './ActivityGrid';
import ProgressStrip from './ProgressStrip';
import AutoFetchAside from './AutoFetchAside';
import './Dashboard.css';

interface Props {
  schedule: ScheduleConfig;
  onOpenSettings: () => void;
  addToast: (msg: string) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard({ schedule, onOpenSettings, addToast }: Props) {
  const [view, setView] = useState<'week' | 'dayofweek'>('week');
  const [year, setYear] = useState(new Date().getFullYear());
  const [dow, setDow] = useState(new Date().getDay());
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>({ phase: 'idle', progress: 0, log: [] });

  useEffect(() => {
    api.history(year).then(setHistory).catch(() => {});
  }, [year]);

  useEffect(() => {
    if (fetchState.phase === 'idle' || fetchState.phase === 'done') return;
    const interval = setInterval(() => {
      api.fetch.status().then(setFetchState);
    }, 500);
    return () => clearInterval(interval);
  }, [fetchState.phase]);

  const scheduleDays = schedule.days.map(d => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(d));

  const handleCellClick = async (date: string) => {
    const today = todayIso();
    if (date > today) {
      addToast(`Can't fetch a future puzzle`);
      return;
    }
    setSelectedDate(date);
    addToast(`Fetching ${date}...`);
    await api.fetch.trigger(date);
    setFetchState({ phase: 'download', progress: 0, log: [] });
    setTimeout(() => api.history(year).then(setHistory), 5000);
  };

  return (
    <section className="section">
      <div className="dash-layout">
        <div>
          <GridToolbar view={view} setView={setView} year={year} setYear={setYear} dow={dow} setDow={setDow} minYear={2010} maxYear={new Date().getFullYear()} />
          <ActivityGrid view={view} year={year} dow={dow} today={todayIso()} selectedDate={selectedDate} scheduleDays={scheduleDays} history={history} onCellClick={handleCellClick} />
          <ProgressStrip state={fetchState} />
        </div>
        <AutoFetchAside schedule={schedule} onEdit={onOpenSettings} onPause={() => { api.schedule.pause(); addToast('Paused for 24 hours'); }} />
      </div>
    </section>
  );
}
