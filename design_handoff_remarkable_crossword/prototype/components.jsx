/* global React */
// Small shared components: buttons, status pill, toast, modal, etc.

function StatusPill({ status, children }) {
  return <span className={`status-pill ${status}`}>{children}</span>;
}

function Kicker({ children }) {
  return <div className="col-label">{children}</div>;
}

function ToastLayer({ toasts }) {
  return (
    <div className="toast-layer">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>{t.msg}</div>
      ))}
    </div>
  );
}

function Modal({ onClose, kicker, title, children }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <button className="close"
                  style={{border:0,background:'transparent',fontFamily:'var(--mono)',fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-3)',cursor:'pointer',padding:'4px 8px'}}
                  onClick={onClose}>Close ✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// Status card used in health section
function StatusCard({ kind, name, state, detail, action }) {
  return (
    <div className={`status-card ${kind}`}>
      <div className="dot" />
      <div className="title-block">
        <div className="name">{name}</div>
        <div className="state">{state}</div>
        {detail && <div className="detail">{detail}</div>}
      </div>
      <div className="action">{action}</div>
    </div>
  );
}

// Weekday picker
function DowPicker({ value, onChange }) {
  const labels = ['S','M','T','W','T','F','S'];
  const abbrs  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const presets = [
    { id: 'all',      label: 'Every day',  days: [0,1,2,3,4,5,6] },
    { id: 'weekdays', label: 'Weekdays',   days: [1,2,3,4,5] },
    { id: 'weekends', label: 'Weekends',   days: [0,6] },
    { id: 'mwf',      label: 'M · W · F',  days: [1,3,5] },
    { id: 'clear',    label: 'Clear',      days: [] },
  ];
  const toggle = (i) => {
    if (value.includes(i)) onChange(value.filter(x => x !== i));
    else onChange([...value, i].sort((a,b) => a-b));
  };
  return (
    <div>
      <div className="dow-presets">
        {presets.map(p => {
          const active = JSON.stringify([...p.days].sort()) === JSON.stringify([...value].sort());
          return (
            <button key={p.id}
                    className={`dow-preset ${active ? 'active' : ''}`}
                    onClick={() => onChange(p.days)}>{p.label}</button>
          );
        })}
      </div>
      <div className="dow">
        {labels.map((L, i) => (
          <button key={i}
                  className={value.includes(i) ? 'on' : ''}
                  onClick={() => toggle(i)}>
            <span className="abbr">{L}</span>
            <span className="full">{abbrs[i].slice(0,3)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  StatusPill, Kicker, ToastLayer, Modal, StatusCard, DowPicker,
});
