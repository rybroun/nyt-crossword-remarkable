import type { ScheduleConfig } from '../types';
import './AutoFetchAside.css';

interface Props {
  schedule: ScheduleConfig;
  onEdit: () => void;
  onPause: () => void;
}

function describeSchedule(days: string[]): string {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) return 'Weekdays';
  if (days.length === 2 && days.includes('sat') && days.includes('sun')) return 'Weekends';
  return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
}

function formatTz(tz: string): string {
  return tz.replace('America/', '').replace('_', ' ');
}

export default function AutoFetchAside({ schedule, onEdit, onPause }: Props) {
  return (
    <aside className="auto-fetch">
      <div className="kicker">Schedule</div>
      <div className="phrase">
        {describeSchedule(schedule.days)}
        <span className="time">at {schedule.time} {formatTz(schedule.timezone)}</span>
      </div>
      <div className="desc">Catches the puzzle the moment it drops.</div>
      <div className="meta-row">
        <span className="label">Next run</span>
        <span className="value">&mdash;</span>
      </div>
      <div className="meta-row">
        <span className="label">Last run</span>
        <span className="value">&mdash;</span>
      </div>
      <div className="card-actions">
        <button className="btn primary" onClick={onEdit}>Edit schedule</button>
        <button className="btn ghost" onClick={onPause}>Pause 24h</button>
      </div>
    </aside>
  );
}
