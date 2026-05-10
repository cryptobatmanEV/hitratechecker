export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = process.env.FACEIT_API_KEY;
  const BASE = 'https://open.faceit.com/data/v4';
  const R = {};

  try {
    // Find dgt
    const sr = await fetch(`${BASE}/search/players?nickname=dgt&game=cs2&limit=5`, {
      headers: { Authorization: `Bearer ${KEY}` }
    });
    const sd = await sr.json();
    const dgt = (sd.items || []).find(p => p.nickname.toLowerCase() === 'dgt');
    if (!dgt) return res.status(404).json({ error: 'dgt not found' });
    R.player = { id: dgt.player_id, name: dgt.nickname, level: dgt.games?.cs2?.skill_level, elo: dgt.games?.cs2?.faceit_elo };

    // Get last 40 matches
    const hr = await fetch(`${BASE}/players/${dgt.player_id}/history?game=cs2&limit=40&offset=0`, {
      headers: { Authorization: `Bearer ${KEY}` }
    });
    const hd = await hr.json();
    const all = hd.items || [];
    R.match_types = all.reduce((acc, m) => {
      acc[m.competition_type] = (acc[m.competition_type] || 0) + 1;
      return acc;
    }, {});
    R.all_competitions = [...new Set(all.map(m => `${m.competition_type}: ${m.competition_name}`))];
    R.total = all.length;
  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
