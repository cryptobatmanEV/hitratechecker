export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = process.env.FACEIT_API_KEY;
  const BASE = 'https://open.faceit.com/data/v4';
  const R = {};

  try {
    const pr = await fetch(`${BASE}/players?nickname=nython&game=cs2`, { headers: { Authorization: `Bearer ${KEY}` } });
    const pd = await pr.json();
    const pid = pd.player_id;
    R.player_id = pid;

    const hr = await fetch(`${BASE}/players/${pid}/history?game=cs2&limit=20&offset=0`, { headers: { Authorization: `Bearer ${KEY}` } });
    const hd = await hr.json();
    const all = hd.items || [];
    const pro = all.filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');
    R.match_breakdown = { total: all.length, championship: pro.length, matchmaking: all.length - pro.length };
    R.competitions = [...new Set(pro.map(m => m.competition_name))];

    if (pro[0]) {
      const sr = await fetch(`${BASE}/matches/${pro[0].match_id}/stats`, { headers: { Authorization: `Bearer ${KEY}` } });
      const sd = await sr.json();
      let kills=0, deaths=0, maps=0;
      for (const round of sd.rounds || []) {
        for (const team of round.teams || []) {
          const p = (team.players||[]).find(x => x.player_id === pid);
          if (p) { kills += parseInt(p.player_stats?.Kills||0); deaths += parseInt(p.player_stats?.Deaths||0); maps++; }
        }
      }
      R.match_test = { competition: pro[0].competition_name, date: new Date(pro[0].started_at*1000).toISOString().split('T')[0], maps, kills, deaths };
    }
  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
