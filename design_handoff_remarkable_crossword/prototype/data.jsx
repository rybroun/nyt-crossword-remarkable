/* global React */
// Fake data + shared helpers for the crossword dashboard prototype.

const WEEKDAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEKDAYS_ABBR  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS_LONG    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_ABBR    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function fmtLongDate(d) {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function fmtMediumDate(d) {
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function fmtWeekday(d) { return WEEKDAYS_LONG[d.getDay()]; }
function fmtWeekdayAbbr(d) { return WEEKDAYS_ABBR[d.getDay()]; }
function fmtTime(d) {
  let h = d.getHours(); const m = pad2(d.getMinutes());
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}
function fmtTimestamp(d) {
  return `${fmtMediumDate(d)} · ${fmtTime(d)}`;
}
function relativeTime(d, now) {
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff/60)} min ago`;
  if (diff < 86400) return `${Math.round(diff/3600)} hr ago`;
  const days = Math.round(diff/86400);
  if (days < 30) return `${days} day${days===1?'':'s'} ago`;
  return fmtMediumDate(d);
}

// A fixed "now" anchor so the prototype reads the same every time.
// Using the project's current date: April 23, 2026.
const NOW = new Date(2026, 3, 23, 9, 14, 0); // Apr 23 2026, 9:14 AM local

function daysAgo(n, hour = 22, minute = 2) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Puzzle day based on weekday
function puzzleSignature(d) {
  const day = d.getDay();
  // Common rough intuition: Mon easiest, Sat hardest, Sun big.
  const map = {
    0: { label: 'Sunday',   size: '21 × 21', difficulty: 'Mid-week' },
    1: { label: 'Monday',   size: '15 × 15', difficulty: 'Easy' },
    2: { label: 'Tuesday',  size: '15 × 15', difficulty: 'Easy-Medium' },
    3: { label: 'Wednesday',size: '15 × 15', difficulty: 'Medium' },
    4: { label: 'Thursday', size: '15 × 15', difficulty: 'Hard / Tricky' },
    5: { label: 'Friday',   size: '15 × 15', difficulty: 'Themeless' },
    6: { label: 'Saturday', size: '15 × 15', difficulty: 'Hardest' },
  };
  return map[day];
}

// Seeded history — covers the past ~90 days so the grid has texture.
// A few interesting failures sprinkled in. Skips some earlier days to show "unscheduled" cells.
const HISTORY = (() => {
  const rows = [];
  // A handful of specific failures (days ago)
  const failures = {
    4:  'Upload to tablet cloud timed out after 30s. Retry succeeded on next run.',
    8:  'NYT session cookie expired. Re-authenticate and retry.',
    23: 'Network unreachable — home internet offline for scheduled window.',
    41: 'Upload to tablet cloud timed out after 30s. Retry succeeded on next run.',
  };
  // Days the scheduler was disabled / not configured (no attempt made)
  const skipped = new Set([55, 56, 57, 58, 59, 60, 76, 77]);
  const sizes = ['198 KB','203 KB','205 KB','210 KB','212 KB','216 KB','218 KB','221 KB','247 KB','284 KB','312 KB'];

  for (let n = 1; n <= 90; n++) {
    if (skipped.has(n)) continue;
    const puzzle = daysAgo(n);
    const fetchedAt = daysAgo(n, 22, 2);
    if (failures[n]) {
      rows.push({
        id: `h${String(n).padStart(3,'0')}`,
        puzzle, fetchedAt,
        status: 'err',
        size: '—',
        reason: failures[n],
        folder: '/Crosswords',
      });
    } else {
      const size = sizes[n % sizes.length];
      rows.push({
        id: `h${String(n).padStart(3,'0')}`,
        puzzle, fetchedAt,
        status: 'ok',
        size,
        folder: '/Crosswords',
        filename: `NYT Crossword — ${fmtMediumDate(puzzle)}.pdf`,
      });
    }
  }
  return rows;
})();

// Schedule phrasing
function describeSchedule(days, time, tz) {
  // days: [0..6] array of day indices (0=Sun)
  const sorted = [...days].sort((a,b) => a-b);
  if (sorted.length === 0) return { lead: 'No schedule set.', when: '—' };
  if (sorted.length === 7)    return { lead: 'Every day',                           when: `at ${time} ${tz}` };
  if (sorted.length === 1)    return { lead: `Every ${WEEKDAYS_LONG[sorted[0]]}`,    when: `at ${time} ${tz}` };
  // Weekdays / Weekends shorthand
  const weekdays = JSON.stringify(sorted) === JSON.stringify([1,2,3,4,5]);
  const weekends = JSON.stringify(sorted) === JSON.stringify([0,6]);
  if (weekdays) return { lead: 'Weekdays',  when: `at ${time} ${tz}` };
  if (weekends) return { lead: 'Weekends',  when: `at ${time} ${tz}` };
  // Custom, list abbreviations
  const abbrs = sorted.map(i => WEEKDAYS_ABBR[i]).join(', ');
  return { lead: abbrs, when: `at ${time} ${tz}` };
}

// Compute next run based on schedule
function computeNextRun(days, time) {
  if (!days.length) return null;
  const [hh, mm] = time.split(':').map(Number);
  const now = new Date(NOW);
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + i);
    candidate.setHours(hh, mm, 0, 0);
    if (candidate <= now) continue;
    if (days.includes(candidate.getDay())) return candidate;
  }
  return null;
}

// Expose globally
Object.assign(window, {
  WEEKDAYS_LONG, WEEKDAYS_ABBR, MONTHS_LONG, MONTHS_ABBR,
  pad2, isoDate, parseISODate,
  fmtLongDate, fmtMediumDate, fmtWeekday, fmtWeekdayAbbr, fmtTime, fmtTimestamp, relativeTime,
  NOW, daysAgo, puzzleSignature, HISTORY,
  describeSchedule, computeNextRun,
});
