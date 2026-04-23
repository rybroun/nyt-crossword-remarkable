import './GridToolbar.css';
const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface Props {
  view: 'week' | 'dayofweek'; setView: (v: 'week' | 'dayofweek') => void;
  year: number; setYear: (y: number) => void;
  dow: number; setDow: (d: number) => void;
  minYear: number; maxYear: number;
}

export default function GridToolbar({ view, setView, year, setYear, dow, setDow, minYear, maxYear }: Props) {
  return (
    <div className="grid-toolbar">
      <div className="grid-toolbar-left">
        <h2>Delivery record</h2>
        <div className="kicker">{view === 'week' ? 'all days' : 'grouped by day of week'}</div>
      </div>
      <div className="grid-toolbar-right">
        <div className="view-pivot" role="tablist">
          <button role="tab" aria-selected={view === 'week'} className={`vp-opt ${view === 'week' ? 'on' : ''}`} onClick={() => setView('week')}>All days</button>
          <button role="tab" aria-selected={view === 'dayofweek'} className={`vp-opt ${view === 'dayofweek' ? 'on' : ''}`} onClick={() => setView('dayofweek')}>Day of week</button>
        </div>
        <div className="year-stepper">
          <button className="ys-step" onClick={() => setYear(Math.max(minYear, year - 1))} disabled={year <= minYear}>&lsaquo;</button>
          <span className="ys-year">{year}</span>
          <button className="ys-step" onClick={() => setYear(Math.min(maxYear, year + 1))} disabled={year >= maxYear}>&rsaquo;</button>
        </div>
        {view === 'dayofweek' && (
          <div className="dow-tabs" role="tablist">
            {DOW_SHORT.map((label, i) => (
              <button key={i} role="tab" aria-selected={dow === i} className={`dow-tab ${dow === i ? 'on' : ''}`} onClick={() => setDow(i)}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
