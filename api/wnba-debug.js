export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const out = {};

  const tests = {
    search_athletes:    'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes?search=clark&limit=5',
    search_all:         'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes?limit=10',
    common_search:      'https://site.api.espn.com/apis/common/v3/search?query=clark&limit=5&type=player&sport=basketball&league=wnba',
    teams:              'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams',
    scoreboard:         'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard',
  };

  for (const [key, url] of Object.entries(tests)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(url, { headers: {'User-Agent': UA}, signal: ctrl.signal });
      clearTimeout(t);
      const text = await r.text();
      out[key] = { status: r.status, ok: r.ok, length: text.length, preview: text.slice(0,150) };
    } catch(e) { out[key] = { error: e.message }; }
  }
  return res.json(out);
}
