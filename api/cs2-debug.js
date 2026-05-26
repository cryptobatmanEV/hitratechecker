export const config = { maxDuration: 30 };
const SCRAPER = process.env.SCRAPER_API_KEY;

async function fetch_url(url) {
  const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent(url)}`, {headers:{Accept:'text/html'}});
  return r.text();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Test if HLTV detailed stats page includes HS in the table
  // glowiing HLTV ID: need to find it first, using known player NiKo (3741) as test
  const urls = [
    // Standard matches page
    'https://www.hltv.org/stats/players/matches/3741/NiKo?startDate=2026-01-01&endDate=2026-05-26',
    // Try with detailedStats or similar params
    'https://www.hltv.org/stats/players/matches/3741/NiKo?startDate=2026-01-01&endDate=2026-05-26&detailedStats=1',
  ];

  for (const url of urls) {
    const html = await fetch_url(url);
    // Check table headers to see what columns exist
    const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tMatch) { out[url] = 'no table'; continue; }
    
    // Get headers
    const headers = [];
    const hRx = /<th[^>]*>([\s\S]*?)<\/th>/gi; let hm;
    while((hm=hRx.exec(tMatch[1]))!==null)
      headers.push(hm[1].replace(/<[^>]+>/g,'').trim());
    
    // Get first data row raw (to see if HS is in K-D cell)
    const firstRow = tMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1]||'';
    const cells = []; const cRx=/<td[^>]*>([\s\S]*?)<\/td>/gi; let cm;
    while((cm=cRx.exec(firstRow))!==null) cells.push(cm[1]);
    
    out[url.includes('detailed') ? 'detailed' : 'standard'] = {
      headers,
      rawKDcell: cells[4] || 'n/a', // raw HTML of K-D cell
      hasHS: html.includes('headshot') || html.includes('(hs)') || html.includes('K (HS)'),
      hsInTable: tMatch[1].toLowerCase().includes('hs') || tMatch[1].toLowerCase().includes('headshot')
    };
  }

  return res.json(out);
}
