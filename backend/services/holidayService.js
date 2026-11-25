import { query, queryOne } from './db.js';

export async function holidaysForMonth(month) {
  const country = (process.env.HOLIDAY_COUNTRY || 'EG').toUpperCase();
  const year = month.slice(0, 4);
  let warning = null;

  const cached = await queryOne(
    "SELECT 1 FROM holidays WHERE country_code = $1 AND to_char(date, 'YYYY') = $2 LIMIT 1",
    [country, year],
  );
  if (!cached) {
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 200) {
        const list = await res.json();
        await query(
          `INSERT INTO holidays (date, country_code, name)
           SELECT d::date, $1, name FROM unnest($2::text[], $3::text[]) AS t(d, name) ON CONFLICT DO NOTHING`,
          [country, list.map((h) => h.date), list.map((h) => h.name.slice(0, 150))],
        );
      } else {
        warning = `Public holidays are not available for ${country}.`;
      }
    } catch (error) {
      console.error(`Nager.Date request failed: ${error.message}`);
      warning = 'Public holidays could not be loaded right now.';
    }
  }

  const holidays = await query(
    "SELECT date, name FROM holidays WHERE country_code = $1 AND to_char(date, 'YYYY-MM') = $2 ORDER BY date",
    [country, month],
  );
  return { holidays, warning };
}
