// Display helpers. API values stay 'YYYY-MM-DD', only the text shown changes.
const DATE = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
const SHORT = { day: 'numeric', month: 'short', timeZone: 'UTC' };

export const fmtDate = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', DATE) : '');

// "14 – 17 Dec 2026", keeping the year once when both dates share it.
export function fmtRange(from, to) {
  if (!from || !to) return '';
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', sameYear ? SHORT : DATE);
  return `${start} – ${fmtDate(to)}`;
}

export const fmtMonth = (m) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function shiftMonth(month, amount) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}
