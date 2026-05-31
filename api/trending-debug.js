export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='lol' } = req.query;
  const host = req.headers.host;
  const out = { sport };

  if (sport === 'lol') {
    // Call actual trending API for lol maps1-3 and show full debug output
    const r = await fetch(`https://${host}/api/trending?sport=lol&scope=maps1-3`);
    const d = await r.json();
    // Show the debug block + first result if any
    out.trending_debug = d.debug;
    out.trending_results_count = (d.results||[]).length;
    out.trending_first_result = (d.results||[])[0];
    out.trending_note = d.note;

    // Also manually verify: compute what Flandre line=9 standard should produce
    const gr = await fetch(`https://${host}/api/lol?action=gamelog&teamId=99566404856367466&teamCode=AL&leagueName=LPL&playerName=Flandre&name=Flandre`);
    const games = await gr.json();
    const arr = Array.isArray(games) ? games : (games.games||[]);
    const g3 = arr.filter(g=>Array.isArray(g.maps)&&g.maps.length>=3);
    const vals = g3.map(g=>g.maps.slice(0,3).reduce((s,m)=>s+(m.kills||0),0));
    out.flandre_check = {
      total_games: arr.length,
      games_with_3maps: g3.length,
      kills_vals_first5: vals.slice(0,5),
      l10_over_9: vals.slice(0,10).filter(v=>v>9).length + '/' + Math.min(vals.length,10),
      l10_avg: vals.length ? (vals.slice(0,10).reduce((a,b)=>a+b,0)/Math.min(vals.length,10)).toFixed(1) : 0,
    };
  }

  if (sport === 'dota') {
    // Test OpenDota direct speed for Dota trending
    const t1 = Date.now();
    const sr = await fetch('https://api.opendota.com/api/search?q=skiter');
    const sd = await sr.json();
    out.search_ms = Date.now()-t1;
    const p = sd[0];
    out.player = p ? {account_id:p.account_id, name:p.personaname} : null;
    if (p?.account_id) {
      const t2 = Date.now();
      const mr = await fetch(`https://api.opendota.com/api/players/${p.account_id}/recentMatches?limit=30`);
      const matches = await mr.json();
      out.matches_ms = Date.now()-t2;
      const comp = (Array.isArray(matches)?matches:[]).filter(m=>m.lobby_type===1);
      out.total_matches = matches.length;
      out.competitive_matches = comp.length;
      out.sample_match = comp[0] ? {kills:comp[0].kills,deaths:comp[0].deaths,start_time:comp[0].start_time} : null;
    }
  }

  return res.json(out);
}
