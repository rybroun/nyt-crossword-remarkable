import type { Status } from '../types';
import './Masthead.css';

interface Props {
  nytStatus: Status;
  rmStatus: Status;
  onNytClick: () => void;
  onRmClick: () => void;
}

export default function Masthead({ nytStatus, rmStatus, onNytClick, onRmClick }: Props) {
  return (
    <header className="masthead">
      <div className="wordmark">Ryan's <em>Remarkable</em></div>
      <div className="lights">
        <button className="light" onClick={onNytClick}>
          <span className={`dot ${nytStatus}`} />NYT
        </button>
        <button className="light" onClick={onRmClick}>
          <span className={`dot ${rmStatus}`} />reMarkable
        </button>
      </div>
    </header>
  );
}
