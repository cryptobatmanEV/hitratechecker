export const config = { maxDuration: 30 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

async function scraperFetch(url) {
  const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}`,{headers:{Accept:'text/html'}});
  return r.text();
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  
  // Fetch Techno's stats page — same one we already use for kills
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now()-365*86400000).toISOString().split('T')[0];
  const html = await scraperFetch(`https://www.hltv.org/stats/players/matches/20275/techno?startDate=${start}&endDate=${end}`);
  
  // Find the stats table
  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tMatch) return res.json({error:'table not found', htmlLength: html.length});
  
  // Get first 3 rows and show RAW cell content (before stripping)
  const rows = tMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[];
  const sampleRows = [];
  let rowCount = 0;
  for (const row of rows) {
    if (/<th/i.test(row)) continue;
    if (rowCount >= 3) break;
    const cells = [];
    const cRx = /<td[^>]*>([\s\S]*?)<\/td>/gi; let cm;
    while((cm=cRx.exec(row))!==null) cells.push(cm[1]);
    sampleRows.push({
      rawCell4: cells[4]||'',  // K-D column (index 4)
      rawCell5: cells[5]||'',  // next column
      afterStrip: (cells[4]||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()
    });
    rowCount++;
  }
  
  return res.json({ sampleRows, message: 'Check rawCell4 and afterStrip for HS data' });
}
