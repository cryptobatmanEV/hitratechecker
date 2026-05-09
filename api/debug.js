export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };

  R.env = {
    RIOT_API_KEY: process.env.RIOT_API_KEY ? `SET (${process.env.RIOT_API_KEY.slice(0,12)}...)` : 'NOT SET',
    FACEIT_API_KEY: process.env.FACEIT_API_KEY ? `SET (${process.env.FACEIT_API_KEY.slice(0,8)}...)` : 'NOT SET',
  };

  async function t(label, fn) {
    try { R[label] = await Promise.race([fn(), new Promise((_,j)=>setTimeout(()=>j(new Error('TIMEOUT 6s')),6000))]); }
    catch(e) { R[label] = { ok: false, error: e.message }; }
  }

  // LoL Esports API - leagues
  await t('lol_esports_leagues', async () => {
    const r = await fetch('https://esports-api.lolesports.com/persisted/gw/getLeagues?hl=en-US', {
      headers: { 'x-api-key': '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z' }
    });
    const d = await r.json();
    const leagues = d.data?.leagues || [];
    return { ok: r.ok, status: r.status, count: leagues.length, sample: leagues.slice(0,3).map(l=>({id:l.id,name:l.name})) };
  });

  // LoL Esports API - teams (player roster search)
  await t('lol_esports_teams', async () => {
    const r = await fetch('https://esports-api.lolesports.com/persisted/gw/getTeams?hl=en-US', {
      headers: { 'x-api-key': '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z' }
    });
    const d = await r.json();
    const teams = d.data?.teams || [];
    // Try to find Faker
    let fakerFound = null;
    for (const team of teams) {
      for (const p of team.players || []) {
        if ((p.summonerName||'').toLowerCase().includes('faker')) {
          fakerFound = { name: p.summonerName, id: p.id, team: team.name, teamId: team.id };
        }
      }
    }
    return { ok: r.ok, status: r.status, teamCount: teams.length, fakerFound, sampleTeam: teams[0] };
  });

  // LoL Esports API - LCK schedule
  await t('lol_lck_schedule', async () => {
    // LCK league ID
    const r = await fetch('https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US&leagueId=98767991299243165', {
      headers: { 'x-api-key': '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z' }
    });
    const d = await r.json();
    const events = d.data?.schedule?.events || [];
    const recent = events.filter(e=>e.state==='completed').slice(0,2);
    return { ok: r.ok, status: r.status, totalEvents: events.length, recentCompleted: recent.map(e=>({matchId:e.match?.id,teams:e.match?.teams?.map(t=>t.code)})) };
  });

  // LoL Esports feed - game window
  await t('lol_feed_window', async () => {
    // Try a known recent LCK game ID (these change - just testing accessibility)
    const r = await fetch('https://feed.lolesports.com/livestats/v1/window/110853020604198770', {
      headers: { 'Accept': 'application/json' }
    });
    return { ok: r.ok, status: r.status };
  });

  // FACEIT CS2 search
  await t('faceit_cs2_nython', async () => {
    const r = await fetch('https://open.faceit.com/data/v4/search/players?nickname=nython&game=cs2&limit=5', {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const d = await r.json();
    const items = d.items || [];
    return { ok: r.ok, status: r.status, found: items.length, results: items.map(p=>({ name: p.nickname, level: p.games?.cs2?.skill_level, elo: p.games?.cs2?.faceit_elo })) };
  });

  return res.status(200).json(R);
}
