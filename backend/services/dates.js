// Dates are 'YYYY-MM-DD' strings, calculated in UTC so a day never shifts.
export const today = () => new Date().toISOString().slice(0, 10);

export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Every night of a stay, check-in included and check-out excluded.
export function nights(from, to) {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}
