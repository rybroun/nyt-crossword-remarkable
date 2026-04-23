/* global React, DowPicker */

function Wizard({ onComplete, onSkip, state, setState }) {
  const [step, setStep] = React.useState(0);
  const [nytEmail, setNytEmail] = React.useState('');
  const [nytPassword, setNytPassword] = React.useState('');
  const [nytSubmitting, setNytSubmitting] = React.useState(false);
  const [nytDone, setNytDone] = React.useState(false);
  const [pairCode, setPairCode] = React.useState(['','','','','','','','']);
  const [pairSubmitting, setPairSubmitting] = React.useState(false);
  const [pairDone, setPairDone] = React.useState(false);

  const steps = [
    { n: '01', t: 'Welcome' },
    { n: '02', t: 'Sign in to NYT' },
    { n: '03', t: 'Pair your tablet' },
    { n: '04', t: 'Set the rhythm' },
  ];

  const submitNyt = () => {
    if (!nytEmail || !nytPassword) return;
    setNytSubmitting(true);
    setTimeout(() => {
      setNytSubmitting(false);
      setNytDone(true);
      setState(s => ({ ...s, nytStatus: 'ok' }));
      setTimeout(() => setStep(2), 500);
    }, 1400);
  };

  const codeRefs = React.useRef([]);
  const onCodeChange = (i, v) => {
    const val = v.toUpperCase().slice(-1);
    const next = [...pairCode];
    next[i] = val;
    setPairCode(next);
    if (val && i < 7) codeRefs.current[i+1]?.focus();
  };
  const onCodeKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !pairCode[i] && i > 0) codeRefs.current[i-1]?.focus();
  };
  const codeFilled = pairCode.every(c => c);

  const submitPair = () => {
    if (!codeFilled) return;
    setPairSubmitting(true);
    setTimeout(() => {
      setPairSubmitting(false);
      setPairDone(true);
      setState(s => ({ ...s, rmStatus: 'ok' }));
      setTimeout(() => setStep(3), 500);
    }, 1500);
  };

  const finish = () => {
    onComplete();
  };

  return (
    <div className="wizard-scrim">
      <div className="wizard">
        <div className="wizard-head">
          <div className="wordmark">Ryan's <em>Remarkable</em></div>
          <div className="caption">Setup · first run</div>
        </div>

        <div className="wizard-steps">
          {steps.map((s, i) => (
            <div key={i} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="n">{s.n}</div>
              <div className="t">{s.t}</div>
            </div>
          ))}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <>
              <h1>A few quiet minutes and you&rsquo;re <em>done.</em></h1>
              <p className="lede">We&rsquo;ll connect to your New York Times account, pair your tablet through the cloud, and decide when the next day&rsquo;s puzzle should quietly appear on your slate. Four short steps.</p>

              <div className="wizard-card">
                <h2>Before you begin</h2>
                <p className="sub">Gather these so you don&rsquo;t have to duck out mid-flow.</p>
                <ol>
                  <li>Your <strong>NYT Games</strong> account login (email and password).</li>
                  <li>Your <strong>reMarkable</strong> tablet, with Wi-Fi on.</li>
                  <li>A browser open to <strong>my.remarkable.com/device/desktop/connect</strong> — you&rsquo;ll fetch an eight-character code in step three.</li>
                </ol>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>Let&rsquo;s meet <em>the paper.</em></h1>
              <p className="lede">The daemon signs in on your behalf, grabs the printable PDF, and stores the session cookie locally. No credentials leave your machine.</p>

              <div className="wizard-card" style={{ opacity: nytDone ? 0.75 : 1 }}>
                <h2>NYT Games account</h2>
                <p className="sub">An active Games or All Access subscription is required.</p>

                <div className="field">
                  <span className="lbl">Email</span>
                  <input type="text" value={nytEmail}
                         disabled={nytDone}
                         onChange={(e) => setNytEmail(e.target.value)}
                         placeholder="you@example.com" />
                </div>
                <div className="field">
                  <span className="lbl">Password</span>
                  <input type="text" value={nytPassword}
                         disabled={nytDone}
                         onChange={(e) => setNytPassword(e.target.value)}
                         placeholder="••••••••••••" />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <button className="btn accent"
                          onClick={submitNyt}
                          disabled={nytSubmitting || nytDone || !nytEmail || !nytPassword}>
                    {nytSubmitting ? 'Signing in…' : nytDone ? '✓ Signed in' : 'Sign in'}
                  </button>
                  {nytDone && (
                    <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ok)' }}>
                      Cookie captured. Expires in about 30 days.
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Introduce <em>the slate.</em></h1>
              <p className="lede">Fetch a one-time eight-character code from <span style={{ fontFamily: 'var(--mono)', fontSize: 15 }}>my.remarkable.com/device/desktop/connect</span> and paste it below. The daemon exchanges it for a long-lived token.</p>

              <div className="wizard-card" style={{ opacity: pairDone ? 0.75 : 1 }}>
                <h2>Pairing code</h2>
                <p className="sub">The code is valid for about five minutes. If it expires, fetch a fresh one.</p>

                <div className="code-input">
                  {pairCode.map((c, i) => (
                    <input key={i}
                           ref={el => codeRefs.current[i] = el}
                           value={c}
                           disabled={pairDone || pairSubmitting}
                           className={c ? 'filled' : ''}
                           onChange={(e) => onCodeChange(i, e.target.value)}
                           onKeyDown={(e) => onCodeKeyDown(i, e)}
                           maxLength={1} />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
                  <button className="btn accent"
                          onClick={submitPair}
                          disabled={!codeFilled || pairSubmitting || pairDone}>
                    {pairSubmitting ? 'Pairing…' : pairDone ? '✓ Paired' : 'Exchange code'}
                  </button>
                  <button className="btn ghost sm"
                          disabled={pairDone}
                          onClick={() => setPairCode(['G','7','K','2','A','9','F','X'])}>
                    Paste sample
                  </button>
                  {pairDone && (
                    <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ok)' }}>
                      Device registered as &lsquo;my-rm&rsquo;.
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1>Set the rhythm, <em>and rest.</em></h1>
              <p className="lede">Pick the days you want a puzzle waiting for you, and the moment the daemon should go fetch it. You can edit any of this later from Settings.</p>

              <div className="wizard-card">
                <h2>Auto-fetch schedule</h2>
                <p className="sub">The next day&rsquo;s crossword unlocks at 10 PM Eastern. Tuesday&rsquo;s puzzle, for instance, appears Monday evening.</p>

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
                    <input type="time" value={state.scheduleTime}
                           onChange={(e) => setState(s => ({ ...s, scheduleTime: e.target.value }))} />
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
                      <option value="CET">Central European (CET)</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <span className="lbl">Folder on tablet</span>
                  <input type="text" value={state.rmFolder}
                         onChange={(e) => setState(s => ({ ...s, rmFolder: e.target.value }))} />
                  <div className="hint">Will be created if it doesn&rsquo;t exist.</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-foot">
          <button className="skip" onClick={onSkip}>Skip setup for now</button>

          <div style={{ display: 'flex', gap: 10 }}>
            {step > 0 && (
              <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>
            )}
            {step === 0 && (
              <button className="btn primary" onClick={() => setStep(1)}>Begin</button>
            )}
            {step === 1 && (
              <button className="btn primary"
                      disabled={!nytDone}
                      onClick={() => setStep(2)}>Continue</button>
            )}
            {step === 2 && (
              <button className="btn primary"
                      disabled={!pairDone}
                      onClick={() => setStep(3)}>Continue</button>
            )}
            {step === 3 && (
              <button className="btn accent" onClick={finish}>Finish setup →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.Wizard = Wizard;
