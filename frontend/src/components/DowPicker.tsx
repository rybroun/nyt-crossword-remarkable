import './DowPicker.css';
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];
const MWF = [1, 3, 5];

interface Props { value: number[]; onChange: (days: number[]) => void; }

export default function DowPicker({ value, onChange }: Props) {
  const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const toggle = (d: number) => {
    onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort());
  };
  return (
    <div className="dow-picker">
      <div className="dow-presets">
        <button className={eq(value, EVERY_DAY) ? 'on' : ''} onClick={() => onChange(EVERY_DAY)}>Every day</button>
        <button className={eq(value, WEEKDAYS) ? 'on' : ''} onClick={() => onChange(WEEKDAYS)}>Weekdays</button>
        <button className={eq(value, WEEKENDS) ? 'on' : ''} onClick={() => onChange(WEEKENDS)}>Weekends</button>
        <button className={eq(value, MWF) ? 'on' : ''} onClick={() => onChange(MWF)}>M W F</button>
        <button onClick={() => onChange([])}>Clear</button>
      </div>
      <div className="dow-toggles">
        {DAY_LETTERS.map((letter, i) => (
          <button key={i} className={`dow-toggle ${value.includes(i) ? 'on' : ''}`} onClick={() => toggle(i)}>{letter}</button>
        ))}
      </div>
    </div>
  );
}
