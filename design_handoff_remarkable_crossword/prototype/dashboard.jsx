/* global React, HISTORY, fmtMediumDate, fmtTime, fmtWeekdayAbbr, describeSchedule, computeNextRun, NOW, relativeTime, isoDate, ActivityGrid */

function Dashboard({
  state, setState,
  openSettings, onRowClick, addToast,
}) {
  const {
    nytStatus, rmStatus,
    scheduleDays, scheduleTime, scheduleTz,
    history,
    selectedDate,
    fetch: fetchState,
  } = state;

  const [view, setView] = React.useState('week'); // 'week' | 'dayofweek'
  const [year, setYear] = React.useState(NOW.getFullYear());
  const [dow, setDow] = React.useState(NOW.getDay()); // selected weekday for dow view

  const minYear = window.MIN_ARCHIVE_YEAR || 2010;
  const maxYear = NOW.getFullYear();

  const sched = describeSchedule(scheduleDays, scheduleTime, scheduleTz);
  const nextRun = computeNextRun(scheduleDays, scheduleTime);

  return (
    <>
      {/* Main layout: activity grid left, auto-fetch aside right */}
      <section className="section">
        <div className="dash-layout">
          <div>
            <div className="grid-toolbar">
              <div className="grid-toolbar-left">
                <div className="section-head" style={{ margin: 0, paddingBottom: 0, border: 'none' }}>
                  <h2>Delivery record</h2>
                  <div className="kicker">
                    {view === 'week' ? 'all days' : 'grouped by day of week'}
                  </div>
                </div>
              </div>

              <div className="grid-toolbar-right">
                <div className="view-pivot" role="tablist" aria-label="Group by">
                  {[
                    { id: 'week', label: 'All days' },
                    { id: 'dayofweek', label: 'Day of week' },
                  ].map(v => (
                    <button key={v.id}
                            role="tab"
                            aria-selected={view === v.id}
                            className={`vp-opt ${view === v.id ? 'on' : ''}`}
                            onClick={() => setView(v.id)}>
                      {v.label}
                    </button>
                  ))}
                </div>

                <div className="year-stepper">
                  <button className="ys-step"
                          onClick={() => setYear(y => Math.max(minYear, y - 1))}
                          disabled={year <= minYear}
                          aria-label="Previous year">‹</button>
                  <div className="ys-year">{year}</div>
                  <button className="ys-step"
                          onClick={() => setYear(y => Math.min(maxYear, y + 1))}
                          disabled={year >= maxYear}
                          aria-label="Next year">›</button>
                </div>

                {view === 'dayofweek' && (
                  <div className="dow-picker" role="tablist" aria-label="Weekday">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((n, i) => (
                      <button key={n}
                              role="tab"
                              aria-selected={dow === i}
                              className={`dp-opt ${dow === i ? 'on' : ''}`}
                              onClick={() => setDow(i)}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ActivityGrid
              history={history}
              scheduleDays={scheduleDays}
              now={NOW}
              selectedDate={selectedDate}
              view={view}
              year={year}
              dow={dow}
              onSelect={(row) => {
                if (row.scheduled) {
                  addToast({ msg: `Scheduled for ${fmtMediumDate(row.puzzle)} · ${scheduleTime} ${scheduleTz}`, kind: 'ok' });
                  setState(s => ({ ...s, selectedDate: isoDate(row.puzzle) }));
                } else {
                  onRowClick(row);
                }
              }}
              onRetry={(row) => {
                if (nytStatus === 'err' || rmStatus === 'err') {
                  addToast({ msg: 'Fix connections before retrying.', kind: 'err' });
                  return;
                }
                addToast({ msg: `Retrying ${fmtMediumDate(row.puzzle)}…`, kind: 'ok' });
                setState(s => ({ ...s, selectedDate: isoDate(row.puzzle) }));
                runFetchSim(setState, addToast, row.puzzle);
              }}
              onFetchPast={(d) => {
                if (nytStatus === 'err' || rmStatus === 'err') {
                  addToast({ msg: 'Fix connections first.', kind: 'err' });
                  return;
                }
                setState(s => ({ ...s, selectedDate: isoDate(d) }));
                addToast({ msg: `Fetching ${fmtMediumDate(d)}…`, kind: 'ok' });
                runFetchSim(setState, addToast, d);
              }}
            />

            {fetchState.phase !== 'idle' && (
              <div className="progress-strip" style={{ borderTop: '1px solid var(--rule)', marginTop: 20, paddingTop: 18 }}>
                <div className="progress-steps">
                  {[
                    { id: 'download', n: '01', t: 'Download PDF' },
                    { id: 'convert',  n: '02', t: 'Prepare file' },
                    { id: 'upload',   n: '03', t: 'Upload to tablet' },
                  ].map((p) => {
                    const order = ['download','convert','upload','done'];
                    const currentIdx = order.indexOf(fetchState.phase);
                    const myIdx = order.indexOf(p.id);
                    const active = myIdx === currentIdx && fetchState.phase !== 'done';
                    const done = myIdx < currentIdx || fetchState.phase === 'done';
                    return (
                      <div key={p.id} className={`progress-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                        <div className="n">{p.n} · {done ? 'Done' : active ? 'Running' : 'Queued'}</div>
                        <div className="t">{p.t}</div>
                        <div className="bar"><i style={{ width: active ? `${fetchState.progress || 0}%` : (done ? '100%' : '0%') }} /></div>
                      </div>
                    );
                  })}
                </div>
                {fetchState.log.length > 0 && (
                  <div className="progress-log">
                    {fetchState.log.map((l, i) => (
                      <span key={i} className={`line ${l.kind || ''}`}>
                        <span className="ts">{l.ts}</span>{l.msg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside>
            <div className="section-head">
              <h2>Auto-fetch</h2>
              <div className="kicker">Schedule</div>
            </div>
            <div className="schedule-card">
              <div className="phrase">
                <em>{sched.lead}</em><br/>{sched.when}
              </div>
              <div className="when">
                {scheduleDays.length === 7
                  ? `Catches the puzzle the moment it drops.`
                  : scheduleDays.length === 0
                  ? `No automatic runs will occur until you enable a day.`
                  : `Skips ${7 - scheduleDays.length} day${7-scheduleDays.length===1?'':'s'} per week.`}
              </div>
              <div className="next-run">
                <span className="lbl">Next run</span>
                <span className="val">
                  {nextRun ? `${fmtWeekdayAbbr(nextRun)} · ${fmtTime(nextRun)}` : '—'}
                </span>
              </div>
              <div className="next-run">
                <span className="lbl">Last run</span>
                <span className="val">
                  {history[0] ? relativeTime(history[0].fetchedAt, NOW) : '—'}
                </span>
              </div>
              <div className="card-actions">
                <button className="btn sm" onClick={openSettings}>Edit schedule</button>
                <button className="btn ghost sm"
                        onClick={() => addToast({ msg: 'Auto-fetch paused for 24 hours.', kind: 'ok' })}>
                  Pause 24h
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function runFetchSim(setState, addToast, puzzleDate) {
  const pushLog = (msg, kind) => {
    setState(s => ({
      ...s,
      fetch: {
        ...s.fetch,
        log: [...s.fetch.log, { ts: nowTs(), msg, kind }].slice(-20),
      },
    }));
  };
  const setPhase = (phase, progress = 0) => {
    setState(s => ({ ...s, fetch: { ...s.fetch, phase, progress } }));
  };
  const setProgress = (progress) => {
    setState(s => ({ ...s, fetch: { ...s.fetch, progress } }));
  };

  setState(s => ({ ...s, fetch: { phase: 'download', progress: 0, log: [] } }));
  pushLog(`Requesting PDF for ${fmtMediumDate(puzzleDate)}…`);

  let step = 0;
  const tick = () => {
    step++;
    if (step <= 20) {
      setProgress(step * 5);
      setTimeout(tick, 70);
      if (step === 10) pushLog('HTTP 200 · 218 KB received', 'ok');
    } else if (step === 21) {
      setPhase('convert', 0);
      pushLog('Staging file for upload…');
      setTimeout(tick, 120);
    } else if (step <= 33) {
      setProgress((step - 21) * 9);
      setTimeout(tick, 50);
    } else if (step === 34) {
      setPhase('upload', 0);
      pushLog(`rmapi put /Crosswords/NYT Crossword — ${fmtMediumDate(puzzleDate)}.pdf`);
      setTimeout(tick, 100);
    } else if (step <= 56) {
      setProgress((step - 34) * 5);
      setTimeout(tick, 80);
    } else {
      setPhase('done', 100);
      pushLog('Delivered ✓ · 1.62 s total', 'ok');
      addToast({ msg: 'Delivered to tablet · /Crosswords', kind: 'ok' });
      setTimeout(() => {
        setState(s => {
          const newRow = {
            id: 'h' + Math.random().toString(36).slice(2, 6),
            puzzle: puzzleDate,
            fetchedAt: new Date(),
            status: 'ok',
            size: '218 KB',
            folder: '/Crosswords',
            filename: `NYT Crossword — ${fmtMediumDate(puzzleDate)}.pdf`,
          };
          const iso = isoDate(puzzleDate);
          const without = s.history.filter(r => isoDate(r.puzzle) !== iso);
          return {
            ...s,
            fetch: { phase: 'idle', progress: 0, log: [] },
            history: [newRow, ...without],
          };
        });
      }, 1600);
    }
  };
  setTimeout(tick, 200);
}

function nowTs() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

window.Dashboard = Dashboard;
window.runFetchSim = runFetchSim;
