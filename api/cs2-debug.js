export const config = { maxDuration: 30 };
const SCRAPER = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const html = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/3741/NiKo?startDate=2026-01-01&endDate=2026-05-26')}`,
    {headers:{Accept:'text/html'}}
  ).then(r=>r.text());

  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tMatch) return res.json({error:'no table'});

  // Get raw HTML of first 2 data rows — no stripping, see exactly what's there
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let m;
  while((m=rowRx.exec(tMatch[1]))!==null) {
    if(!/<th/i.test(m[1])) rows.push(m[1]);
    if(rows.length >= 2) break;
  }

  // Show raw HTML of each cell in row 1
  const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const rawCells = [];
  while((m=cellRx.exec(rows[0]||''))!==null) rawCells.push(m[1]);

  return res.json({
    row1_raw: rows[0]?.substring(0,500),
    cell_count: rawCells.length,
    cell5_raw: rawCells[5] || 'n/a',  // K-D column (index 5 or 6?)
    cell6_raw: rawCells[6] || 'n/a',
    all_cells_stripped: rawCells.map(c=>c.replace(/<[^>]+>/g,'').trim()),
    hs_context: (() => {
      const idx = tMatch[1].toLowerCase().indexOf('hs');
      return idx >= 0 ? tMatch[1].substring(Math.max(0,idx-50), idx+100) : 'not found';
    })()
  });
}
