import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import type { Status, ScheduleConfig, Settings } from './types';
import Masthead from './components/Masthead';
import Dashboard from './dashboard/Dashboard';
import SettingsDrawer from './settings/SettingsDrawer';
import Wizard from './wizard/Wizard';
import './global.css';

export default function App() {
  const [nytStatus, setNytStatus] = useState<Status>('ok');
  const [rmStatus, setRmStatus] = useState<Status>('ok');
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    time: '22:00', timezone: 'America/New_York', enabled: true,
  });
  const [settings, setSettings] = useState<Settings>({
    remarkable_folder: '/Crosswords', file_pattern: 'NYT Crossword - {Mon DD, YYYY}',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);

  useEffect(() => {
    api.health.nyt().then(h => {
      const s = h.status === 'ok' ? 'ok' : h.status === 'expired' ? 'err' : 'warn';
      setNytStatus(s);
      if (h.status === 'not_configured') setWizardOpen(true);
    }).catch(() => setNytStatus('err'));
    api.health.remarkable().then(h => {
      setRmStatus(h.status === 'ok' ? 'ok' : h.status === 'disconnected' ? 'err' : 'warn');
    }).catch(() => setRmStatus('err'));
    api.schedule.get().then(setSchedule).catch(() => {});
    api.settings.get().then(setSettings).catch(() => {});
  }, []);

  const addToast = useCallback((msg: string) => {
    setToasts(t => [...t, msg]);
    setTimeout(() => setToasts(t => t.slice(1)), 3000);
  }, []);

  return (
    <div className="app paper-bg" style={{ position: 'relative', zIndex: 1 }}>
      <Masthead nytStatus={nytStatus} rmStatus={rmStatus} onNytClick={() => { if (nytStatus !== 'ok') setWizardOpen(true); else addToast('NYT session valid'); }} onRmClick={() => { if (rmStatus !== 'ok') setWizardOpen(true); else addToast('reMarkable connected'); }} />
      <Dashboard schedule={schedule} onOpenSettings={() => setSettingsOpen(true)} addToast={addToast} />
      <footer style={{ padding: '12px 48px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
          Ryan's Remarkable &middot; <em>a small daemon, printed nightly</em>
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
          v0.1.0 &middot; <button style={{ background: 'none', border: 'none', textDecoration: 'underline', fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', color: 'inherit' }} onClick={() => setSettingsOpen(true)}>preferences</button>
        </span>
      </footer>
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        schedule={schedule}
        setSchedule={setSchedule}
        settings={settings}
        setSettings={setSettings}
        nytStatus={nytStatus}
        rmStatus={rmStatus}
        addToast={addToast}
      />
      {wizardOpen && (
        <Wizard
          onComplete={() => { setWizardOpen(false); window.location.reload(); }}
          onSkip={() => setWizardOpen(false)}
        />
      )}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 200 }}>
          {toasts.map((msg, i) => (
            <div key={i} style={{ background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px' }}>{msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
