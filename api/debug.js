export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = 'EZh1xSg_WEPRN6z0RgNlFAD7Std9vS4r6HKJbaZLo0BbxSRULNg';
  const BASE = 'https://api.pandascore.co';
  const results = {};

  async function ps(label, path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const r = await fetch(`${BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await r.text();
      results[label] = { status: r.status, ok: r.ok, preview: text.slice(0, 800) };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
    }
  }

  // Get recent completed LoL games
  await ps('lol_completed_games',
    '/lol/games?filter[complete]=true&sort=-begin_at&per_page=2'
  );

  // Get recent completed LoL match with detailed stats
  await ps('lol_completed_match',
    '/lol/matches/past?filter[detailed_stats]=true&sort=-end_at&per_page=1'
  );

  // TenZ Valorant - get his full record (ID 20401 from previous result)
  await ps('tenz_info',
    '/players/20401'
  );

  // Try getting a specific completed LoL game detail (game 219310 from before)
  await ps('lol_game_detail',
    '/lol/games/219310'
  );

  // Try CS2 games list to find one with player stats
  await ps('cs2_completed_games',
    '/csgo/games?filter[complete]=true&sort=-begin_at&per_page=2'
  );

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
