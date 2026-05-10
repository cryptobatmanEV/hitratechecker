export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = process.env.FACEIT_API_KEY;
  const BASE = 'https://open.faceit.com/data/v4';
  const R = {};

  // The REAL dgt's FACEIT ID from Liquipedia
  const REAL_DGT_ID = '20e9f61c-8072-4f50-b257-b6b4219669d2';

  // 1. Get profile for the real dgt
  try {
    const r = await fetch(`${BASE}/players/${REAL_DGT_ID}`, {
      headers: { Authorization: `Bearer ${KEY}` }
    });
    const d = await r.json();
    R.real_dgt_profile = {
      id: d.player_id,
      name: d.nickname,
      country: d.country,
      level: d.games?.cs2?.skill_level,
      elo: d.games?.cs2?.faceit_elo
    };
  } catch(e) { R.profile_error = e.message; }

  // 2. Get their match history - check for championships
  try {
    const r = await fetch(`${BASE}/players/${REAL_DGT_ID}/history?game=cs2&limit=40&offset=0`, {
      headers: { Authorization: `Bearer ${KEY}` }
    });
    const d = await r.json();
    const all = d.items || [];
    const championships = all.filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');
    const matchmaking = all.filter(m => m.competition_type === 'matchmaking');
    R.real_dgt_history = {
      total: all.length,
      championships: championships.length,
      matchmaking: matchmaking.length,
      competition_names: [...new Set(all.map(m => `${m.competition_type}: ${m.competition_name}`))],
      first_championship: championships[0] ? {
        name: championships[0].competition_name,
        date: new Date(championships[0].started_at * 1000).toISOString().split('T')[0]
      } : null
    };
  } catch(e) { R.history_error = e.message; }

  // 3. Also verify: Liquipedia can resolve ANY pro player name to FACEIT ID
  // Test with NiKo
  try {
    const r = await fetch('https://liquipedia.net/counterstrike/api.php?action=parse&page=NiKo&prop=wikitext&format=json', {
      headers: { 'User-Agent': 'EV Cave Hit Rate Tool/1.0' }
    });
    const d = await r.json();
    const wikitext = d.parse?.wikitext?.['*'] || '';
    const faceitMatch = wikitext.match(/\|faceitdb=([^\n|]+)/);
    R.niko_faceit_id = faceitMatch ? faceitMatch[1].trim() : 'not found';
  } catch(e) { R.niko_error = e.message; }

  return res.status(200).json(R);
}
