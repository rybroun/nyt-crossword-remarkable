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
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function SettingsDrawer({ open, onClose, schedule, setSchedule, settings, setSettings, nytStatus, rmStatus, addToast }: Props) {
  const scheduleDaysAsNumbers = schedule.days.map(d => DAY_NAMES.indexOf(d));

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
            <div className="hint">Tokens: {'{Mon DD, YYYY}'}</div>
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
            <button className="btn" onClick={() => addToast('Re-auth flow coming soon')}>Re-authenticate</button>
          )}
        </div>
      </aside>
    </>
  );
}
