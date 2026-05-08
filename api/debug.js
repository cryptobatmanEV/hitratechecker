export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  async function test(label, url, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html, */*',
          ...headers
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await r.text();
      results[label] = { status: r.status, ok: r.ok, isJson: text.trim().startsWith('{') || text.trim().startsWith('['), preview: text.slice(0, 400) };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'BLOCKED/TIMEOUT' : e.message };
    }
  }

  // HLTV player match stats (s1mple player ID is 7998 on HLTV)
  await test('hltv_player_stats',
    'https://www.hltv.org/stats/players/7998/s1mple'
  );

  // HLTV player matches endpoint
  await test('hltv_player_matches',
    'https://www.hltv.org/stats/players/matches/7998/s1mple?startDate=2024-01-01&endDate=2026-12-31'
  );

  // HLTV JSON endpoint used by some community tools
  await test('hltv_json',
    'https://hltv-api.vercel.app/api/player?id=7998'
  );

  // PandaScore CS2 game detail - test with a real game ID from earlier match data
  // From cs2_real_match we got match with ID we need to find
  await test('pandascore_cs2_match_detail',
    'https://api.pandascore.co/csgo/matches/past?filter[forfeit]=false&filter[detailed_stats]=true&sort=-end_at&per_page=1',
    { 'Authorization': 'Bearer EZh1xSg_WEPRN6z0RgNlFAD7Std9vS4r6HKJbaZLo0BbxSRULNg' }
  );

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
