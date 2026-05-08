export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = 'EZh1xSg_WEPRN6z0RgNlFAD7Std9vS4r6HKJbaZLo0BbxSRULNg';
  const BASE = 'https://api.pandascore.co';
  const results = {};

  async function ps(label, path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(`${BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await r.text();
      results[label] = { status: r.status, ok: r.ok, preview: text.slice(0, 500) };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
    }
  }

  // Test 1: Search for a CS2 player
  await ps('cs2_player_search', '/players?search[name]=s1mple&videogame=cs-go&per_page=3');

  // Test 2: Search for a LoL player
  await ps('lol_player_search', '/players?search[name]=Faker&videogame=league-of-legends&per_page=3');

  // Test 3: Search for a Valorant player
  await ps('val_player_search', '/players?search[name]=TenZ&videogame=valorant&per_page=3');

  // Test 4: CS2 games with player filter (s1mple ID from PandaScore is likely around 43)
  await ps('cs2_games_filter', '/csgo/games?filter[player_id]=43&sort=-begin_at&per_page=3');

  // Test 5: CS2 recent matches
  await ps('cs2_matches', '/csgo/matches/past?sort=-begin_at&per_page=2');

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
