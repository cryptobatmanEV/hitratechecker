export const config = { maxDuration: 10 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = 'https://www.hltv.org/stats/matches/mapstatsid/228816/5star-vs-flyquest';
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  const html = await r.text();

  const tableM = html.match(/<table[^>]*totalstats[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableM) return res.json({ error: 'no table' });

  // Get all player names and first kills cell from each row
  const rows = [];
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRx.exec(tableM[1])) !== null) {
    if (/<th/i.test(m[1])) continue;
    const playerName = (m[1].match(/class="[^"]*st-player[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '')
      .replace(/<[^>]+>/g, '').trim();
    const killsCell = (m[1].match(/class="st-kills[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '')
      .replace(/\s+/g, ' ');
    rows.push({ playerName, killsCell_raw: killsCell.slice(0, 200) });
  }

  return res.json({ rows });
}
