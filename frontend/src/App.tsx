import { useEffect, useState } from 'react';
import { api } from './api';
import type { Status } from './types';
import Masthead from './components/Masthead';
import './global.css';

export default function App() {
  const [nytStatus, setNytStatus] = useState<Status>('ok');
  const [rmStatus, setRmStatus] = useState<Status>('ok');

  useEffect(() => {
    api.health.nyt().then(h => {
      setNytStatus(h.status === 'ok' ? 'ok' : h.status === 'expired' ? 'err' : 'warn');
    }).catch(() => setNytStatus('err'));
    api.health.remarkable().then(h => {
      setRmStatus(h.status === 'ok' ? 'ok' : h.status === 'disconnected' ? 'err' : 'warn');
    }).catch(() => setRmStatus('err'));
  }, []);

  return (
    <div className="app paper-bg" style={{ position: 'relative', zIndex: 1 }}>
      <Masthead nytStatus={nytStatus} rmStatus={rmStatus} onNytClick={() => {}} onRmClick={() => {}} />
      <main style={{ padding: '48px' }}>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 20 }}>Dashboard loading...</p>
      </main>
    </div>
  );
}
