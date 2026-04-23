import type { FetchState } from '../types';
import './ProgressStrip.css';

interface Props { state: FetchState; }

const PHASES = [
  { key: 'download', num: '01', name: 'Download PDF' },
  { key: 'prepare', num: '02', name: 'Prepare file' },
  { key: 'upload', num: '03', name: 'Upload to tablet' },
];

export default function ProgressStrip({ state }: Props) {
  if (state.phase === 'idle') return null;
  return (
    <div className="progress-strip">
      <div className="progress-phases">
        {PHASES.map(p => {
          const phaseIdx = PHASES.findIndex(x => x.key === state.phase);
          const thisIdx = PHASES.findIndex(x => x.key === p.key);
          const done = phaseIdx > thisIdx || state.phase === 'done';
          const active = state.phase === p.key;
          return (
            <div key={p.key} className="progress-phase">
              <span className="num">{p.num}</span>
              <div className="name">{p.name}</div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: done ? '100%' : active ? `${state.progress}%` : '0%' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="progress-log">
        {state.log.map((l, i) => (
          <div key={i} className={l.kind || ''}>{l.ts} &middot; {l.msg}</div>
        ))}
      </div>
    </div>
  );
}
