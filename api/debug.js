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

  // T1 recent LoL matches (team ID 126061 from Faker search)
  await ps('t1_lol_matches', '/lol/matches/past?filter[opponent_id]=126061&sort=-end_at&per_page=3');

  // Faker player stats endpoint
  await ps('faker_stats', '/lol/players/585/stats');

  // CS2 players game-specific search
  await ps('cs2_player_niko', '/csgo/players?search[name]=NiKo&per_page=3');

  // Valorant players
  await ps('val_player_tenz', '/valorant/players?search[name]=TenZ&per_page=5');

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
