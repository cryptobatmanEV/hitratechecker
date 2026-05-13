export const config = { maxDuration: 10 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { playerId = 'hltv_20462_story' } = req.query;

  const parts = playerId.split('_');
  const hltvId = parts[1];
  const hltvSlug = parts.slice(2).join('_');
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
  const url = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;

  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  const html = await r.text();

  // Find the first data row raw HTML to see link structure
  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tMatch) return res.json({ error: 'table not found', status: r.status });

  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowM;
  const rows = [];
  while ((rowM = rowRx.exec(tMatch[1])) !== null) {
    if (/<th/i.test(rowM[1])) continue;
    rows.push(rowM[1].slice(0, 800)); // raw HTML of first few rows
    if (rows.length >= 2) break;
  }

  // Also find all href links in the table
  const links = [];
  const lRx = /href="([^"]+)"/gi;
  let lm;
  while ((lm = lRx.exec(tMatch[1])) !== null) {
    if (!links.includes(lm[1])) links.push(lm[1]);
    if (links.length >= 10) break;
  }

  return res.json({ status: r.status, first_2_rows_raw: rows, table_links: links });
}
