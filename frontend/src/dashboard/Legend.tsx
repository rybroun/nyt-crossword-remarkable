import './Legend.css';
export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-item"><div className="legend-swatch ok" /> Delivered</div>
      <div className="legend-item"><div className="legend-swatch err" /> Failed · click to retry</div>
      <div className="legend-item"><div className="legend-swatch none" /> Unscheduled · click to fetch</div>
      <div className="legend-item"><div className="legend-swatch upcoming" /> Upcoming</div>
      <div className="legend-item"><div className="legend-swatch future-ns" /> Not scheduled</div>
    </div>
  );
}
