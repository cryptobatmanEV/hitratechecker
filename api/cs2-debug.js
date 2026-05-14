export const config = { maxDuration: 30 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

async function scraperFetch(url) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Fetch story's match list and check if _matchUrl is extracted
  try {
    const html = await scraperFetch(
      'https://www.hltv.org/stats/players/matches/20462/story?startDate=2025-11-01&endDate=2026-05-20'
    );
    const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowM;
    const matchUrls = [];
    while ((rowM = rowRx.exec(tMatch?.[1] || '')) !== null) {
      if (/<th/i.test(rowM[1])) continue;
      const urlM = rowM[1].match(/href="(\/stats\/matches\/mapstatsid\/[^"?]+)/);
      matchUrls.push(urlM ? urlM[1] : 'NO_URL_FOUND');
      if (matchUrls.length >= 3) break;
    }
    results.matchUrls = matchUrls;
  } catch(e) { results.matchUrlsError = e.message; }

  // 2. If we got a URL, test fetchMatchHeadshots
  if (results.matchUrls?.[0] && results.matchUrls[0] !== 'NO_URL_FOUND') {
    try {
      const html = await scraperFetch(`https://www.hltv.org${results.matchUrls[0]}`);
      const tableRx = /<table[^>]*totalstats[^>]*>([\s\S]*?)<\/table>/gi;
      let tableM; const allPlayers = [];
      while ((tableM = tableRx.exec(html)) !== null) {
        const rowRx2 = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowM2;
        while ((rowM2 = rowRx2.exec(tableM[1])) !== null) {
          if (/<th/i.test(rowM2[1])) continue;
          const pCell = rowM2[1].match(/class="[^"]*st-player[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '';
          const name = pCell.replace(/<[^>]+>/g, '').trim();
          const killsCell = rowM2[1].match(/class="st-kills[^"]*traditional[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '';
          const hsMatch = killsCell.match(/\((\d+)\)/);
          allPlayers.push({ name, hs: hsMatch?.[1] || 'no hs found', killsRaw: killsCell.slice(0, 80) });
        }
      }
      results.matchPlayers = allPlayers;
      results.storyHS = allPlayers.find(p => p.name.toLowerCase().includes('story'))?.hs || 'story not found';
    } catch(e) { results.hsError = e.message; }
  }

  return res.json(results);
}
