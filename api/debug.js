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
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await r.text();
      results[label] = { status: r.status, ok: r.ok, preview: text.slice(0, 600) };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
    }
  }

  // Search without videogame filter - find real NiKo (famous CS2 player)
  await ps('niko_search', '/players?search[name]=NiKo&per_page=5');

  // Search Faker LoL without game filter
  await ps('faker_lol', '/lol/players?search[name]=Faker&per_page=5');

  // Search TenZ Valorant
  await ps('tenz_val', '/valorant/players?search[name]=TenZ&per_page=5');

  // Get a real CS2 match (completed, not forfeit)
  await ps('cs2_real_match', '/csgo/matches/past?filter[forfeit]=false&sort=-end_at&per_page=2');

  // Get videogames list to find correct slugs
  await ps('videogames', '/videogames?per_page=10');

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
