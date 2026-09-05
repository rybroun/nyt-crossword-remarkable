import type { Status } from '../types';
import './Masthead.css';

interface Props {
  userName: string;
  nytStatus: Status;
  rmStatus: Status;
  libgenStatus: Status;
  onNytClick: () => void;
  onRmClick: () => void;
  onLibgenClick: () => void;
}

export default function Masthead({ userName, nytStatus, rmStatus, libgenStatus, onNytClick, onRmClick, onLibgenClick }: Props) {
  const displayName = userName || 'Your';
  return (
    <header className="masthead">
      <div className="wordmark">{displayName}'s <em>Remarkable</em></div>
      <div className="lights">
        <button className="light" onClick={onNytClick}>
          <span className={`dot ${nytStatus}`} />NYT
        </button>
        <button className="light" onClick={onRmClick}>
          <span className={`dot ${rmStatus}`} />reMarkable
        </button>
        <button className="light" onClick={onLibgenClick}>
          <span className={`dot ${libgenStatus}`} />Libgen
        </button>
      </div>
    </header>
  );
}
