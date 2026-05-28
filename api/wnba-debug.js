export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const get = async (url) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(url, { headers: {'User-Agent': UA}, signal: ctrl.signal });
      clearTimeout(t);
      const text = await r.text();
      return { status: r.status, ok: r.ok, length: text.length, preview: text.slice(0, 200) };
    } catch(e) { return { error: e.message }; }
  };

  // Caitlin Clark confirmed ID: 4433403
  const id = '4433403';

  const tests = {
    core_eventlog:     `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}/eventlog?limit=10`,
    core_stats:        `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2026/athletes/${id}/statistics/0`,
    core_athlete:      `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}`,
    site_stats:        `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes/${id}/stats`,
    site_overview:     `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes/${id}/overview`,
    fantasy_gamelog:   `https://fantasy.espn.com/apis/v3/games/fba/seasons/2026/players/${id}/realtimescoring?view=pba`,
  };

  const out = {};
  for (const [key, url] of Object.entries(tests)) {
    out[key] = await get(url);
  }
  return res.json(out);
}
