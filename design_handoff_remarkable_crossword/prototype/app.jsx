/* global React, ReactDOM, Dashboard, SettingsDrawer, Wizard, Modal, ToastLayer, HISTORY, NOW, isoDate, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSelect, TweakButton, fmtMediumDate, fmtTimestamp, fmtWeekday, StatusPill */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "nytStatus": "ok",
  "rmStatus": "ok",
  "showWizard": false,
  "density": "regular"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [state, setState] = React.useState({
    nytStatus: t.nytStatus,
    rmStatus: t.rmStatus,
    scheduleDays: [0,1,2,3,4,5,6],
    scheduleTime: '22:00',
    scheduleTz: 'ET',
    rmFolder: '/Crosswords',
    rmPattern: 'NYT Crossword — {date}',
    history: HISTORY,
    selectedDate: isoDate(NOW),
    fetch: { phase: 'idle', progress: 0, log: [] },
  });

  // Sync tweak-controlled state into app state
  React.useEffect(() => {
    setState(s => ({ ...s, nytStatus: t.nytStatus, rmStatus: t.rmStatus }));
  }, [t.nytStatus, t.rmStatus]);

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(t.showWizard);
  const [detailRow, setDetailRow] = React.useState(null);
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => { setWizardOpen(t.showWizard); }, [t.showWizard]);

  const addToast = React.useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, ...toast }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 3600);
  }, []);

  // Density
  const densityScale = t.density === 'compact' ? 0.9 : t.density === 'comfy' ? 1.08 : 1;

  return (
    <div className="app paper-bg" style={{ fontSize: `${16 * densityScale}px` }}>
      {/* Masthead — slim */}
      <header className="masthead">
        <div className="wordmark">Ryan's <em>Remarkable</em></div>
        <div className="lights">
          <button className={`light ${state.nytStatus}`}
                  title={state.nytStatus === 'ok' ? 'NYT session valid · click for details' : 'NYT session expired — click to re-authenticate'}
                  onClick={() => state.nytStatus !== 'ok' ? setWizardOpen(true) : addToast({ msg: 'NYT session valid · expires in ~27 days', kind: 'ok' })}>
            <span className="bulb" /> NYT
          </button>
          <button className={`light ${state.rmStatus}`}
                  title={state.rmStatus === 'ok' ? 'reMarkable cloud connected · click for details' : 'reMarkable cloud unreachable — click to reconnect'}
                  onClick={() => state.rmStatus !== 'ok' ? setWizardOpen(true) : addToast({ msg: 'reMarkable paired · my-rm', kind: 'ok' })}>
            <span className="bulb" /> reMarkable
          </button>
        </div>
        <div className="masthead-meta">
        </div>
      </header>

      <main className="page">
        <Dashboard
          state={state}
          setState={setState}
          openSettings={() => setSettingsOpen(true)}
          onRowClick={(row) => setDetailRow(row)}
          addToast={addToast}
        />

        <footer className="colophon">
          <div>
            Ryan's Remarkable · <em style={{ fontFamily: 'var(--serif)', textTransform: 'none', letterSpacing: 0, fontStyle: 'italic' }}>a small daemon, printed nightly</em>
          </div>
          <div>
            v0.4.1 · <a onClick={() => setSettingsOpen(true)}>preferences</a>
          </div>
        </footer>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        setState={setState}
        addToast={addToast}
      />

      {wizardOpen && (
        <Wizard
          state={state}
          setState={setState}
          onComplete={() => {
            setWizardOpen(false);
            setTweak('showWizard', false);
            addToast({ msg: 'Setup complete · daemon is listening.', kind: 'ok' });
          }}
          onSkip={() => {
            setWizardOpen(false);
            setTweak('showWizard', false);
          }}
        />
      )}

      {detailRow && (
        <Modal
          onClose={() => setDetailRow(null)}
          kicker={`Delivery · ${detailRow.id}`}
          title={fmtMediumDate(detailRow.puzzle)}
        >
          <dl className="dl">
            <dt>Puzzle date</dt>
            <dd className="serif">{fmtWeekday(detailRow.puzzle)}, {fmtMediumDate(detailRow.puzzle)}</dd>
            <dt>Fetched</dt>
            <dd>{fmtTimestamp(detailRow.fetchedAt)}</dd>
            <dt>Status</dt>
            <dd><StatusPill status={detailRow.status}>{detailRow.status === 'ok' ? 'Delivered' : 'Failed'}</StatusPill></dd>
            <dt>Destination</dt>
            <dd>{detailRow.folder}{detailRow.filename ? `/${detailRow.filename}` : ''}</dd>
            <dt>Size</dt>
            <dd>{detailRow.size}</dd>
          </dl>

          <div className="log-block">
{detailRow.status === 'ok'
? `[10:00:00] scheduler: run triggered
[10:00:00] nyt.auth: session cookie valid (27d)
[10:00:00] nyt.fetch: GET /puzzles/print/${isoDate(detailRow.puzzle)}.pdf
[10:00:01] nyt.fetch: 200 OK · ${detailRow.size}
[10:00:01] staging:  /tmp/crossword-${isoDate(detailRow.puzzle)}.pdf
[10:00:01] rmapi put → "${detailRow.folder}/${detailRow.filename}"
[10:00:02] rmapi: upload complete · id=01HTXK…
[10:00:02] scheduler: run finished · ok (1.84 s)`
: `[10:00:00] scheduler: run triggered
[10:00:00] nyt.auth: ${detailRow.reason.includes('cookie') ? 'session cookie REJECTED (401)' : 'session cookie valid'}
[10:00:12] ${detailRow.reason}
[10:00:12] scheduler: run finished · error`}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {detailRow.status === 'err' && (
              <button className="btn accent sm"
                      onClick={() => {
                        setDetailRow(null);
                        addToast({ msg: 'Retrying delivery…', kind: 'ok' });
                      }}>Retry now</button>
            )}
            <button className="btn sm"
                    onClick={() => addToast({ msg: 'Full log exported.', kind: 'ok' })}>
              Export full log
            </button>
          </div>
        </Modal>
      )}

      <ToastLayer toasts={toasts} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Simulate connections" />
        <TweakRadio label="NYT"
                    value={t.nytStatus}
                    options={[
                      { value: 'ok', label: 'Ok' },
                      { value: 'warn', label: 'Warn' },
                      { value: 'err', label: 'Expired' },
                    ]}
                    onChange={(v) => setTweak('nytStatus', v)} />
        <TweakRadio label="reMarkable"
                    value={t.rmStatus}
                    options={[
                      { value: 'ok', label: 'Ok' },
                      { value: 'warn', label: 'Stale' },
                      { value: 'err', label: 'Down' },
                    ]}
                    onChange={(v) => setTweak('rmStatus', v)} />

        <TweakSection label="Flows" />
        <TweakToggle label="Show setup wizard"
                     value={t.showWizard}
                     onChange={(v) => setTweak('showWizard', v)} />
        <TweakButton label="Open settings drawer"
                     onClick={() => setSettingsOpen(true)} />
        <TweakButton secondary label="Simulate a fetch"
                     onClick={() => {
                       if (state.fetch.phase !== 'idle') return;
                       window.runFetchSim && window.runFetchSim(setState, addToast, new Date());
                     }} />

        <TweakSection label="Density" />
        <TweakRadio label="Density"
                    value={t.density}
                    options={[
                      { value: 'compact', label: 'Compact' },
                      { value: 'regular', label: 'Regular' },
                      { value: 'comfy', label: 'Comfy' },
                    ]}
                    onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </div>
  );
}

// Expose the fetch sim on window so the tweak button can trigger it
// (dashboard.jsx also attaches Dashboard/runFetchSim but runFetchSim wasn't exported)
// Here we re-require via the global if present.

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
