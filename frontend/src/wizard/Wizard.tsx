import { useState, useRef } from 'react';
import { api } from '../api';
import DowPicker from '../components/DowPicker';
import './Wizard.css';

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

const STEPS = [
  { n: '01', t: 'Welcome' },
  { n: '02', t: 'Sign in to NYT' },
  { n: '03', t: 'Pair your tablet' },
  { n: '04', t: 'Set the rhythm' },
];

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function Wizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nytLoading, setNytLoading] = useState(false);
  const [nytDone, setNytDone] = useState(false);
  const [nytError, setNytError] = useState('');
  const [pairCode, setPairCode] = useState(['', '', '', '', '', '', '', '']);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairDone, setPairDone] = useState(false);
  const [pairError, setPairError] = useState('');
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [time, setTime] = useState('22:00');
  const [tz, setTz] = useState('America/New_York');
  const [folder, setFolder] = useState('/Crosswords');
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submitNyt = async () => {
    setNytLoading(true); setNytError('');
    const res = await api.auth.nytLogin(email, password);
    setNytLoading(false);
    if (res.status === 'ok') { setNytDone(true); setTimeout(() => setStep(2), 500); }
    else setNytError(res.error || 'Login failed. You can also paste your cookie manually.');
  };

  const onCodeChange = (i: number, v: string) => {
    const val = v.toUpperCase().slice(-1);
    const next = [...pairCode]; next[i] = val; setPairCode(next);
    if (val && i < 7) codeRefs.current[i + 1]?.focus();
  };

  const onCodeKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pairCode[i] && i > 0) codeRefs.current[i - 1]?.focus();
  };

  const submitPair = async () => {
    setPairLoading(true); setPairError('');
    const res = await api.auth.remarkablePair(pairCode.join(''));
    setPairLoading(false);
    if (res.status === 'ok') { setPairDone(true); setTimeout(() => setStep(3), 500); }
    else setPairError(res.error || 'Pairing failed.');
  };

  const finish = async () => {
    await api.schedule.update({ days: days.map(d => DAY_NAMES[d]), time, timezone: tz, enabled: true });
    onComplete();
  };

  return (
    <div className="wizard-scrim">
      <div className="wizard">
        <div className="wizard-head">
          <div className="wordmark">Ryan's <em>Remarkable</em></div>
          <div className="caption">Setup &middot; first run</div>
        </div>
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div key={i} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span>{s.n}</span> <span>{s.t}</span>
            </div>
          ))}
        </div>
        <div className="wizard-body">
          {step === 0 && (
            <>
              <h1>A few quiet minutes and you're <em>done.</em></h1>
              <p className="lede">We'll connect to your New York Times account, pair your tablet through the cloud, and decide when the next day's puzzle should quietly appear on your slate.</p>
            </>
          )}
          {step === 1 && (
            <>
              <h1>Sign in to <em>NYT</em></h1>
              {!nytDone ? (
                <>
                  <div className="field"><span className="lbl">Email</span><input value={email} onChange={e => setEmail(e.target.value)} /></div>
                  <div className="field"><span className="lbl">Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
                  {nytError && <p style={{ color: 'var(--err)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14 }}>{nytError}</p>}
                </>
              ) : (
                <p style={{ color: 'var(--ok)', fontFamily: 'var(--serif)' }}>{'\u2713'} Signed in. Cookie captured.</p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <h1>Pair your <em>tablet</em></h1>
              <p className="lede">Go to <strong>my.remarkable.com/connect/desktop</strong>, get the 8-character code, and enter it below.</p>
              {!pairDone ? (
                <>
                  <div className="otp-inputs">
                    {pairCode.map((c, i) => (
                      <input key={i} ref={el => { codeRefs.current[i] = el; }} value={c} maxLength={1}
                        onChange={e => onCodeChange(i, e.target.value)}
                        onKeyDown={e => onCodeKeyDown(i, e)} />
                    ))}
                  </div>
                  {pairError && <p style={{ color: 'var(--err)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14 }}>{pairError}</p>}
                </>
              ) : (
                <p style={{ color: 'var(--ok)', fontFamily: 'var(--serif)' }}>{'\u2713'} Paired. Device registered.</p>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <h1>Set the <em>rhythm</em></h1>
              <div className="field"><span className="lbl">Days</span><DowPicker value={days} onChange={setDays} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div className="field"><span className="lbl">Time</span><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
                <div className="field"><span className="lbl">Timezone</span>
                  <select value={tz} onChange={e => setTz(e.target.value)}>
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 12 }}><span className="lbl">Folder</span><input value={folder} onChange={e => setFolder(e.target.value)} /></div>
            </>
          )}
        </div>
        <div className="wizard-footer">
          <button className="skip" onClick={onSkip}>Skip setup for now</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
            {step === 0 && <button className="btn primary" onClick={() => setStep(1)}>Begin</button>}
            {step === 1 && !nytDone && <button className="btn primary" onClick={submitNyt} disabled={!email || !password || nytLoading}>{nytLoading ? 'Signing in...' : 'Sign in'}</button>}
            {step === 2 && !pairDone && <button className="btn primary" onClick={submitPair} disabled={!pairCode.every(c => c) || pairLoading}>{pairLoading ? 'Pairing...' : 'Exchange code'}</button>}
            {step === 3 && <button className="btn primary" onClick={finish}>Finish setup &rarr;</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
