/* global React, DowPicker */

function SettingsDrawer({ open, onClose, state, setState, addToast }) {
  return (
    <>
      <div className={`drawer-scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head">
          <h2>Settings</h2>
          <button className="close" onClick={onClose}>Close ✕</button>
        </div>
        <div className="drawer-body">

          {/* Schedule */}
          <div className="settings-section">
            <h3>Schedule</h3>
            <div className="sub">When the daemon should reach for the next day&rsquo;s puzzle, and on which days of the week.</div>

            <div className="field">
              <span className="lbl">Days of the week</span>
              <DowPicker
                value={state.scheduleDays}
                onChange={(days) => setState(s => ({ ...s, scheduleDays: days }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <span className="lbl">Run at</span>
                <input type="time"
                       value={state.scheduleTime}
                       onChange={(e) => setState(s => ({ ...s, scheduleTime: e.target.value }))} />
                <div className="hint">The next day&rsquo;s puzzle unlocks around 10 PM ET.</div>
              </div>
              <div className="field">
                <span className="lbl">Timezone</span>
                <select value={state.scheduleTz}
                        onChange={(e) => setState(s => ({ ...s, scheduleTz: e.target.value }))}>
                  <option value="ET">Eastern (ET)</option>
                  <option value="CT">Central (CT)</option>
                  <option value="MT">Mountain (MT)</option>
                  <option value="PT">Pacific (PT)</option>
                  <option value="UTC">UTC</option>
                  <option value="GMT">GMT (London)</option>
                  <option value="CET">Central European (CET)</option>
                </select>
              </div>
            </div>
          </div>

          {/* reMarkable */}
          <div className="settings-section">
            <h3>reMarkable destination</h3>
            <div className="sub">Where the file lands on the tablet, and how it&rsquo;s named.</div>

            <div className={`auth-callout ${state.rmStatus}`}>
              <div className="row">
                <span className="name">rmapi pairing</span>
                <span className="state">
                  {state.rmStatus === 'ok' ? '✓ Connected' : state.rmStatus === 'warn' ? '⚠ Stale' : '✕ Disconnected'}
                </span>
              </div>
              <div className="desc">
                {state.rmStatus === 'ok'
                  ? 'Paired with device \u2018my-rm\u2019. Last successful upload 4 minutes ago.'
                  : state.rmStatus === 'err'
                  ? 'The stored token no longer works. Re-pair to resume uploads.'
                  : 'Pairing still valid, but last successful upload was over an hour ago.'}
              </div>
              {state.rmStatus !== 'ok' && (
                <button className="btn sm"
                        onClick={() => addToast({ msg: 'Re-pair flow would open here.', kind: 'ok' })}>
                  Re-pair device
                </button>
              )}
            </div>

            <div className="field">
              <span className="lbl">Folder on device</span>
              <input type="text"
                     value={state.rmFolder}
                     onChange={(e) => setState(s => ({ ...s, rmFolder: e.target.value }))} />
              <div className="hint">Created on the tablet if it doesn&rsquo;t exist.</div>
            </div>

            <div className="field">
              <span className="lbl">Filename pattern</span>
              <input type="text"
                     value={state.rmPattern}
                     onChange={(e) => setState(s => ({ ...s, rmPattern: e.target.value }))} />
              <div className="hint">
                Tokens: <code style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-3)', padding: '1px 4px' }}>{'{date}'}</code>,{' '}
                <code style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-3)', padding: '1px 4px' }}>{'{weekday}'}</code>,{' '}
                <code style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-3)', padding: '1px 4px' }}>{'{iso}'}</code>
              </div>
            </div>
          </div>

          {/* NYT auth */}
          <div className="settings-section">
            <h3>NYT authentication</h3>
            <div className="sub">The daemon keeps your session cookie in the config file, and uses it to download the printable PDF.</div>

            <div className={`auth-callout ${state.nytStatus}`}>
              <div className="row">
                <span className="name">Session cookie</span>
                <span className="state">
                  {state.nytStatus === 'ok' ? '✓ Valid' : state.nytStatus === 'warn' ? '⚠ Expiring' : '✕ Expired'}
                </span>
              </div>
              <div className="desc">
                {state.nytStatus === 'ok'
                  ? 'Expires in about 27 days. Stored at ~/.config/nyt-crossword-remarkable/config.json.'
                  : state.nytStatus === 'warn'
                  ? 'Valid, but expires in under 48 hours. Consider refreshing.'
                  : 'The cookie was rejected by NYT on the last attempt. You\u2019ll need to sign in again.'}
              </div>
              <button className="btn sm"
                      onClick={() => {
                        setState(s => ({ ...s, nytStatus: 'ok' }));
                        addToast({ msg: 'NYT cookie refreshed.', kind: 'ok' });
                      }}>
                Re-authenticate
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3>Diagnostics</h3>
            <div className="sub">For the moments when something goes sideways.</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn sm"
                      onClick={() => addToast({ msg: 'Wrote diagnostics.log to ~/.config/…', kind: 'ok' })}>
                Export logs
              </button>
              <button className="btn ghost sm"
                      onClick={() => addToast({ msg: 'Config opened in default editor.', kind: 'ok' })}>
                Open config
              </button>
              <button className="btn ghost sm"
                      onClick={() => addToast({ msg: 'Background scheduler restarted.', kind: 'ok' })}>
                Restart scheduler
              </button>
            </div>
          </div>

        </div>
      </aside>
    </>
  );
}

window.SettingsDrawer = SettingsDrawer;
