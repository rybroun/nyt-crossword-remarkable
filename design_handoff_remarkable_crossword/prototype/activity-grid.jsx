/* global React, isoDate, fmtMediumDate, fmtWeekday, MONTHS_ABBR */
// Activity grid — two pivots of the same weekly data:
//   • week        — 7 rows (DOW) × N weeks in the selected year (GitHub-style)
//   • dayofweek   — 7 rows (DOW) × N occurrences of that weekday, packed left.
//                   Same as Week but with empty gaps removed per row, so every
//                   row becomes a dense timeline of just that weekday. Lets you
//                   scan "how am I doing on Mondays vs Saturdays".
//
// Cell semantics:
//   ok, err, none (past unscheduled), future-scheduled, future

const MIN_YEAR = 2010;

function ActivityGrid({
  history, scheduleDays, now, selectedDate,
  view, year, dow,
  onSelect, onRetry, onFetchPast,
}) {
  const map = React.useMemo(() => {
    const m = new Map();
    for (const r of history) m.set(isoDate(r.puzzle), r);
    return m;
  }, [history]);

  const todayIso = isoDate(now);

  const cellState = (d) => {
    const iso = isoDate(d);
    const row = map.get(iso);
    if (row) return row.status === 'ok' ? 'ok' : 'err';
    if (iso > todayIso) {
      if (scheduleDays.includes(d.getDay())) return 'future-scheduled';
      return 'future';
    }
    return 'none';
  };

  const handleClick = (d) => {
    const iso = isoDate(d);
    const state = cellState(d);
    const row = map.get(iso);
    if (iso > todayIso && state !== 'future-scheduled') return;
    if (state === 'err') onRetry(row);
    else if (state === 'ok') onSelect(row);
    else if (state === 'none') onFetchPast(d);
    else if (state === 'future-scheduled') onSelect({ scheduled: true, puzzle: d });
  };

  const [tip, setTip] = React.useState(null);
  const showTip = (e, d) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      date: d,
      state: cellState(d),
      row: map.get(isoDate(d)),
    });
  };
  const hideTip = () => setTip(null);

  const shared = { cellState, handleClick, showTip, hideTip, todayIso, selectedDate, map };

  return (
    <div className="cal" onMouseLeave={hideTip}>
      {view === 'week'      && <WeekView year={year} {...shared} />}
      {view === 'dayofweek' && <DowView  year={year} dow={dow} {...shared} />}

      {tip && <CellTip tip={tip} />}

      <div className="cal-legend">
        <div className="item"><span className="sw ok" /> Delivered</div>
        <div className="item"><span className="sw err" /> Failed · click to retry</div>
        <div className="item"><span className="sw none" /> Unscheduled · click to fetch</div>
        <div className="item"><span className="sw scheduled" /> Upcoming</div>
        <div className="item"><span className="sw future" /> Not scheduled</div>
      </div>
    </div>
  );
}

/* ── Build weeks for a year ───────────────────────────────────────────────
   Returns: {
     weeks: Array<Array<Date>>  // each inner array is Sun..Sat
     monthLabels: Array<{ wi, label }>
   }
*/
function buildWeeks(year) {
  const start = new Date(year, 0, 1);
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
  const end = new Date(year, 11, 31);
  while (end.getDay() !== 6) end.setDate(end.getDate() + 1);

  const weeks = [];
  const cursor = new Date(start);
  let cur = [];
  while (cursor <= end) {
    cur.push(new Date(cursor));
    if (cursor.getDay() === 6) { weeks.push(cur); cur = []; }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (cur.length) weeks.push(cur);

  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const firstOfMonth = w.find(d => d.getFullYear() === year && d.getDate() <= 7 && d.getMonth() !== lastMonth);
    if (firstOfMonth) {
      monthLabels.push({ wi, label: MONTHS_ABBR[firstOfMonth.getMonth()] });
      lastMonth = firstOfMonth.getMonth();
    }
  });
  return { weeks, monthLabels };
}

/* ── Week view ─────────────────────────────────────────────────────────── */
function WeekView({ year, cellState, handleClick, showTip, todayIso, selectedDate }) {
  const { weeks, monthLabels } = React.useMemo(() => buildWeeks(year), [year]);

  return (
    <div className="cal-week">
      <div className="cal-dows">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
      </div>
      <div className="cal-grid-wrap">
        <div className="cal-months" style={{ width: (weeks.length * 17) }}>
          {monthLabels.map((m, i) => (
            <span key={i} style={{ left: m.wi * 17 }}>{m.label}</span>
          ))}
        </div>
        <div className="cal-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 14px)` }}>
          {weeks.map((w, wi) => (
            w.map((d, di) => {
              const iso = isoDate(d);
              const state = cellState(d);
              const outsideYear = d.getFullYear() !== year;
              const baseClass = state.startsWith('future') ? 'future' : state;
              const scheduled = state === 'future-scheduled';
              const isToday = iso === todayIso;
              const isSelected = iso === selectedDate;
              return (
                <button
                  key={iso}
                  className={[
                    'cell',
                    baseClass,
                    scheduled ? 'scheduled' : '',
                    isToday ? 'today' : '',
                    isSelected ? 'selected' : '',
                    outsideYear ? 'outside' : '',
                  ].join(' ')}
                  onMouseEnter={(e) => showTip(e, d)}
                  onFocus={(e) => showTip(e, d)}
                  onClick={() => !outsideYear && handleClick(d)}
                  aria-label={`${fmtMediumDate(d)} · ${state}`}
                  style={{ gridColumn: wi + 1, gridRow: di + 1 }}
                />
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Day-of-week view ──────────────────────────────────────────────────────
   One weekday across the year, same visual scale as the All-days grid.
   X axis = months (Jan..Dec, 12 columns).
   Y axis = occurrence # within the month (1st..5th, 5 rows).
*/
function DowView({ year, dow, cellState, handleClick, showTip, todayIso, selectedDate }) {
  const MAX_OCC = 5;

  // columns[m] = array of dates in month m that fall on `dow`
  const columns = React.useMemo(() => {
    return Array.from({ length: 12 }).map((_, m) => {
      const out = [];
      const d = new Date(year, m, 1);
      while (d.getMonth() === m) {
        if (d.getDay() === dow) out.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      return out;
    });
  }, [year, dow]);

  return (
    <div className="cal-week">
      {/* Row labels (1st..5th) — reuse the same column slot as the weekday labels */}
      <div className="cal-dows dow-occ-labels">
        {['1st','2nd','3rd','4th','5th'].map((l) => <div key={l}>{l}</div>)}
      </div>

      <div className="cal-grid-wrap">
        <div className="cal-months dow-month-letters" style={{ width: (12 * 17) }}>
          {Array.from({ length: 12 }).map((_, m) => (
            <span key={m} style={{ left: m * 17 + 7, transform: 'translateX(-50%)' }}>
              {MONTHS_ABBR[m][0]}
            </span>
          ))}
        </div>
        <div className="cal-grid dow-focus-grid-inner"
             style={{ gridTemplateColumns: `repeat(12, 14px)`, gridTemplateRows: `repeat(5, 14px)`, gap: 3 }}>
          {columns.map((col, m) => (
            Array.from({ length: MAX_OCC }).map((_, occ) => {
              const d = col[occ];
              if (!d) {
                return (
                  <span key={`${m}-${occ}`}
                        className="cell blank"
                        style={{ gridColumn: m + 1, gridRow: occ + 1 }} />
                );
              }
              const iso = isoDate(d);
              const state = cellState(d);
              const baseClass = state.startsWith('future') ? 'future' : state;
              const scheduled = state === 'future-scheduled';
              const isToday = iso === todayIso;
              const isSelected = iso === selectedDate;
              return (
                <button
                  key={iso}
                  className={[
                    'cell',
                    baseClass,
                    scheduled ? 'scheduled' : '',
                    isToday ? 'today' : '',
                    isSelected ? 'selected' : '',
                  ].join(' ')}
                  onMouseEnter={(e) => showTip(e, d)}
                  onFocus={(e) => showTip(e, d)}
                  onClick={() => handleClick(d)}
                  aria-label={`${fmtMediumDate(d)} · ${state}`}
                  style={{ gridColumn: m + 1, gridRow: occ + 1 }}
                />
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Shared tooltip ────────────────────────────────────────────────────── */
function CellTip({ tip }) {
  return (
    <div className="cal-tip" style={{ left: tip.x, top: tip.y }}>
      <div>
        <span className="d">{fmtMediumDate(tip.date)}</span>
        <span className="weekday">{fmtWeekday(tip.date)}</span>
      </div>
      {tip.state === 'ok' && (
        <>
          <div className="state ok">✓ Delivered · {tip.row.size}</div>
          <div className="reason" style={{ fontStyle: 'normal', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'oklch(96% 0.012 85 / 0.7)' }}>
            {tip.row.filename}
          </div>
          <div className="action" style={{ color: 'oklch(96% 0.012 85 / 0.6)' }}>Click for details</div>
        </>
      )}
      {tip.state === 'err' && (
        <>
          <div className="state err">✕ Failed</div>
          <div className="reason">{tip.row.reason}</div>
          <div className="action">Click to retry</div>
        </>
      )}
      {tip.state === 'none' && (
        <>
          <div className="state none">— Not scheduled</div>
          <div className="action" style={{ color: 'oklch(96% 0.012 85 / 0.65)' }}>Click to fetch this day</div>
        </>
      )}
      {tip.state === 'future' && (
        <div className="state future">Not scheduled</div>
      )}
      {tip.state === 'future-scheduled' && (
        <>
          <div className="state scheduled">◷ Scheduled · 10:00 PM ET</div>
          <div className="action" style={{ color: 'oklch(72% 0.14 22)' }}>Click to preview</div>
        </>
      )}
    </div>
  );
}

window.ActivityGrid = ActivityGrid;
window.MIN_ARCHIVE_YEAR = MIN_YEAR;
