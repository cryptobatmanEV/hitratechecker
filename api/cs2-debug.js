export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Step 1: Are env vars set?
  out.env = {
    SCRAPER_KEY_SET: !!process.env.SCRAPER_API_KEY,
    KV_URL_SET: !!process.env.KV_REST_API_URL,
    SCRAPER_KEY_PREFIX: process.env.SCRAPER_API_KEY?.substring(0,8)+'...'
  };

  // Step 2: Can ScraperAPI fetch a simple HLTV page?
  try {
    const url = `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/20275/Techno?startDate=2026-01-01&endDate=2026-05-25')}`;
    const r = await fetch(url, { headers: { Accept: 'text/html' } });
    out.scraperapi = {
      status: r.status,
      ok: r.ok,
      contentType: r.headers.get('content-type'),
      htmlLength: (await r.text()).length
    };
  } catch(e) {
    out.scraperapi = { error: e.message };
  }

  // Step 3: Does the HTML have the stats table?
  try {
    const url = `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/20275/Techno?startDate=2026-01-01&endDate=2026-05-25')}`;
    const r = await fetch(url, { headers: { Accept: 'text/html' } });
    const html = await r.text();
    out.hasStatsTable = html.includes('stats-matches-table');
    out.htmlSnippet = html.substring(0, 200);
  } catch(e) {
    out.step3 = { error: e.message };
  }

  return res.json(out);
}
