import { useState, useRef } from 'react';
import type { ScheduleConfig, Settings, Status } from '../types';
import { api } from '../api';
import DowPicker from '../components/DowPicker';
import './SettingsDrawer.css';

interface Props {
  open: boolean;
  onClose: () => void;
  schedule: ScheduleConfig;
  setSchedule: (s: ScheduleConfig) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  nytStatus: Status;
  rmStatus: Status;
  addToast: (msg: string) => void;
  onRerunWizard: () => void;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function SettingsDrawer({ open, onClose, schedule, setSchedule, settings, setSettings, nytStatus, rmStatus, addToast, onRerunWizard }: Props) {
  const scheduleDaysAsNumbers = schedule.days.map(d => DAY_NAMES.indexOf(d));

  const [cookie, setCookie] = useState('');
  const [cookieLoading, setCookieLoading] = useState(false);

  const [pairCode, setPairCode] = useState(['', '', '', '', '', '', '', '']);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState('');
  const pairRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submitCookie = async () => {
    setCookieLoading(true);
    try {
      await api.auth.nytCookie(cookie);
      setCookie('');
      addToast('NYT cookie saved');
    } catch { addToast('Failed to save cookie'); }
    setCookieLoading(false);
  };

  const onPairChange = (i: number, v: string) => {
    const val = v.toUpperCase().slice(-1);
    const next = [...pairCode]; next[i] = val; setPairCode(next);
    if (val && i < 7) pairRefs.current[i + 1]?.focus();
  };

  const onPairPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\s/g, '').toUpperCase().slice(0, 8);
    const next = [...pairCode];
    for (let j = 0; j < text.length; j++) next[j] = text[j];
    setPairCode(next);
    pairRefs.current[Math.min(text.length, 7)]?.focus();
  };

  const onPairKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pairCode[i] && i > 0) pairRefs.current[i - 1]?.focus();
  };

  const submitPair = async () => {
    setPairLoading(true); setPairError('');
    const res = await api.auth.remarkablePair(pairCode.join(''));
    setPairLoading(false);
    if (res.status === 'ok') { setPairCode(['', '', '', '', '', '', '', '']); addToast('reMarkable paired'); }
    else setPairError(res.error || 'Pairing failed.');
  };

  const handleDaysChange = (nums: number[]) => {
    const newSched = { ...schedule, days: nums.map(n => DAY_NAMES[n]) };
    setSchedule(newSched);
    api.schedule.update(newSched);
  };

  return (
    <>
      <div className={`drawer-scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-head">
          <h2>Settings</h2>
          <button className="close" onClick={onClose}>Close &#10005;</button>
        </div>

        <div className="settings-section">
          <h3>Profile</h3>
          <div className="sub">Personalize your dashboard.</div>
          <div className="field">
            <span className="lbl">Your name</span>
            <input value={settings.user_name} onChange={e => {
              const s = { ...settings, user_name: e.target.value };
              setSettings(s); api.settings.update(s);
            }} placeholder="e.g. Ryan" />
          </div>
        </div>

        <div className="settings-section">
          <h3>Schedule</h3>
          <div className="sub">When the daemon should reach for the next day's puzzle.</div>
          <div className="field">
            <span className="lbl">Days of the week</span>
            <DowPicker value={scheduleDaysAsNumbers} onChange={handleDaysChange} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <span className="lbl">Run at</span>
              <input type="time" value={schedule.time} onChange={e => {
                const s = { ...schedule, time: e.target.value };
                setSchedule(s); api.schedule.update(s);
              }} />
              <div className="hint">The next day's puzzle unlocks around 10 PM ET.</div>
            </div>
            <div className="field">
              <span className="lbl">Timezone</span>
              <select value={schedule.timezone} onChange={e => {
                const s = { ...schedule, timezone: e.target.value };
                setSchedule(s); api.schedule.update(s);
              }}>
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>reMarkable destination</h3>
          <div className="sub">Where the file lands on the tablet.</div>
          <div className={`auth-callout ${rmStatus}`}>
            <div className="row">
              <span>rmapi pairing</span>
              <span>{rmStatus === 'ok' ? '\u2713 Connected' : '\u2715 Disconnected'}</span>
            </div>
            <div className="desc">{rmStatus === 'ok' ? 'Device paired and reachable.' : 'Re-pair to resume uploads.'}</div>
          </div>
          {rmStatus !== 'ok' && (
            <>
              <div className="desc" style={{ marginBottom: 8 }}>Go to <strong>my.remarkable.com/device/browser/connect</strong>, get the code, and paste it below.</div>
              <div className="otp-inputs" style={{ marginBottom: 8 }}>
                {pairCode.map((c, i) => (
                  <input key={i} ref={el => { pairRefs.current[i] = el; }} value={c} maxLength={1}
                    onChange={e => onPairChange(i, e.target.value)}
                    onKeyDown={e => onPairKeyDown(i, e)}
                    onPaste={onPairPaste} />
                ))}
              </div>
              {pairError && <div className="desc" style={{ color: 'var(--err)', marginBottom: 8 }}>{pairError}</div>}
              <button className="btn" onClick={submitPair} disabled={!pairCode.every(c => c) || pairLoading}>{pairLoading ? 'Pairing...' : 'Re-pair device'}</button>
            </>
          )}
          <div className="field">
            <span className="lbl">Folder on device</span>
            <input value={settings.remarkable_folder} onChange={e => {
              const s = { ...settings, remarkable_folder: e.target.value };
              setSettings(s); api.settings.update(s);
            }} />
          </div>
          <div className="field">
            <span className="lbl">Filename pattern</span>
            <input value={settings.file_pattern} onChange={e => {
              const s = { ...settings, file_pattern: e.target.value };
              setSettings(s); api.settings.update(s);
            }} />
            <div className="hint">Tokens: {'{date}'} {'{weekday}'} {'{mon}'} {'{dd}'} {'{yyyy}'} {'{Mon DD, YYYY}'}</div>
          </div>
        </div>

        <div className="settings-section">
          <h3>NYT authentication</h3>
          <div className="sub">Session cookie for the crossword API.</div>
          <div className={`auth-callout ${nytStatus}`}>
            <div className="row">
              <span>NYT session</span>
              <span>{nytStatus === 'ok' ? '\u2713 Valid' : '\u2715 Expired'}</span>
            </div>
            <div className="desc">{nytStatus === 'ok' ? 'Cookie valid.' : 'Re-authenticate to resume fetches.'}</div>
          </div>
          {nytStatus !== 'ok' && (
            <>
              <div className="desc" style={{ marginBottom: 8 }}>Go to <strong>nytimes.com/crosswords</strong>, log in, press <strong>Cmd+Option+I</strong>, then Application &rarr; Cookies &rarr; nytimes.com and copy the <strong>NYT-S</strong> value.</div>
              <div className="field">
                <span className="lbl">NYT-S cookie</span>
                <input value={cookie} onChange={e => setCookie(e.target.value)} placeholder="Paste your NYT-S cookie value" />
              </div>
              <button className="btn" onClick={submitCookie} disabled={!cookie || cookieLoading}>{cookieLoading ? 'Saving...' : 'Save cookie'}</button>
            </>
          )}
        </div>

        <div className="settings-section" style={{ borderBottom: 'none' }}>
          <button className="btn ghost" onClick={onRerunWizard}>Rerun setup wizard</button>
        </div>
      </aside>
    </>
  );
}
