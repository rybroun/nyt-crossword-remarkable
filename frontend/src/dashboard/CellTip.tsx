import type { CellState, HistoryRecord } from '../types';
import './CellTip.css';

interface Props {
  x: number; y: number;
  date: string; state: CellState;
  record?: HistoryRecord;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  return ` · ${Math.round(bytes / 1024)} KB`;
}

export default function CellTip({ x, y, date, state, record }: Props) {
  return (
    <div className="cell-tip" style={{ left: x, top: y }}>
      <div className="tip-date">{formatDate(date)}</div>
      <div>
        {state === 'ok' && <>{'\u2713'} Delivered{formatSize(record?.size_bytes)}</>}
        {state === 'err' && <>{'\u2715'} Failed{record?.error ? ` \u2014 ${record.error}` : ''}</>}
        {state === 'none' && <>{'\u2014'} Not scheduled</>}
        {state === 'future-scheduled' && <>{'\u25F7'} Scheduled</>}
        {state === 'future' && <>Not scheduled</>}
      </div>
      <div className="tip-action">
        {state === 'ok' && 'Click for details'}
        {state === 'err' && 'Click to retry'}
        {state === 'none' && 'Click to fetch this day'}
        {state === 'future-scheduled' && 'Click to preview'}
      </div>
    </div>
  );
}
