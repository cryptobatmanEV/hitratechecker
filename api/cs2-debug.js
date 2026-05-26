export const config = { maxDuration: 30 };
const SCRAPER = process.env.SCRAPER_API_KEY;
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Check HLTV K-D cell RAW HTML — does it contain HS in any span?
  const html = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/3741/NiKo?startDate=2026-01-01&endDate=2026-05-26')}`,
    {headers:{Accept:'text/html'}}
  ).then(r=>r.text());

  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (tMatch) {
    // Get all rows
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = []; let m;
    while((m=rowRx.exec(tMatch[1]))!==null) {
      if(!/<th/i.test(m[1])) rows.push(m[1]);
      if(rows.length >= 3) break;
    }
    // Show FULL raw HTML of the K-D cell for first 3 rows
    rows.forEach((row, i) => {
      const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = []; let cm;
      while((cm=cellRx.exec(row))!==null) cells.push(cm[1]);
      out[`row${i+1}_kd_raw`] = cells[4] || 'n/a'; // raw HTML, no stripping
      out[`row${i+1}_kd_stripped`] = (cells[4]||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    });
  }

  // 2. Search GRID for BC Game Masters variants
  const searches = ['BC.Game','BCGame','BC Game','Masters Europe','Betway Masters','ESL Masters'];
  for (const term of searches) {
    const r = await cdQ(`{ tournaments(filter:{name:{contains:"${term}"}},first:3){ edges{node{id name startDate}} } }`);
    const results = r?.data?.tournaments?.edges?.map(e=>e.node)||[];
    if (results.length) out[`grid_"${term}"`] = results;
  }

  // 3. Also search for the specific May 2026 Cybershoke series in GRID that match HLTV dates
  // HLTV shows Cybershoke vs Nemiga on 10/05/2026 — does GRID have a series around that date?
  const r = await cdQ(`{
    allSeries(filter:{
      teamIds:{in:["52247"]}
      startTimeScheduled:{gte:"2026-05-01T00:00:00Z"}
    }, first:20, orderBy:StartTimeScheduled) {
      edges{node{id startTimeScheduled tournament{id name}}}
    }
  }`);
  out.cybershoke_may2026 = r?.data?.allSeries?.edges?.map(e=>e.node)||[];

  return res.json(out);
}
