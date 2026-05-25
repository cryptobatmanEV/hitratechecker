export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const start = Date.now();
  
  try {
    const r = await fetch(
      `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/20275/Techno?startDate=2026-01-01&endDate=2026-05-25')}`,
      { headers: { Accept: 'text/html' } }
    );
    const html = await r.text();
    const elapsed = Date.now() - start;
    
    return res.json({
      status: r.status,
      ok: r.ok,
      elapsed_ms: elapsed,
      hasStatsTable: html.includes('stats-matches-table'),
      htmlLength: html.length
    });
  } catch(e) {
    return res.json({ error: e.message, elapsed_ms: Date.now() - start });
  }
}
