export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };
  const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const ESB = 'https://esports-api.lolesports.com/persisted/gw';
  const FEED = 'https://feed.lolesports.com/livestats/v1';

  // Step 1: Find Faker in T1 active roster — show exact name + IDs
  try {
    const r = await fetch(`${ESB}/getTeams?hl=en-US`, { headers: { 'x-api-key': KEY } });
    const d = await r.json();
    const t1 = (d.data?.teams || []).find(t => t.code === 'T1' && t.status === 'active');
    R.t1_team = {
      id: t1?.id,
      code: t1?.code,
      status: t1?.status,
      leagueName: t1?.homeLeague?.name,
      players: (t1?.players || []).map(p => ({ id: p.id, summonerName: p.summonerName, firstName: p.firstName, lastName: p.lastName }))
    };
  } catch(e) { R.t1_error = e.message; }

  // Step 2: Get game IDs from GEN vs T1 match on April 8
  try {
    const r = await fetch(`${ESB}/getEventDetails?hl=en-US&id=115548128962840643`, { headers: { 'x-api-key': KEY } });
    const d = await r.json();
    const games = d.data?.event?.match?.games || [];
    R.gen_t1_games = games.map(g => ({ id: g.id, state: g.state }));
  } catch(e) { R.gen_t1_games_error = e.message; }

  // Step 3: Get game IDs from T1 vs DNS — May 8 (YESTERDAY)
  try {
    const r = await fetch(`${ESB}/getEventDetails?hl=en-US&id=115548128962971887`, { headers: { 'x-api-key': KEY } });
    const d = await r.json();
    const games = d.data?.event?.match?.games || [];
    R.t1_dns_may8_games = games.map(g => ({ id: g.id, state: g.state }));

    // Step 4: Test feed window for May 8 game (should definitely be fresh)
    if (games[0]?.id) {
      const feedR = await fetch(`${FEED}/window/${games[0].id}?startingTime=2026-05-08T23:59:50.000Z`);
      const feedD = await feedR.json();
      const frames = feedD.frames || [];
      const last = frames[frames.length - 1];
      const blueMeta = feedD.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
      const redMeta  = feedD.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
      R.may8_feed = {
        status: feedR.status,
        gameId: games[0].id,
        frameCount: frames.length,
        players: [...blueMeta, ...redMeta].map(p => p.summonerName),
        faker_stats: (() => {
          const fakerMeta = [...blueMeta, ...redMeta].find(p => (p.summonerName||'').toLowerCase().includes('faker'));
          if (!fakerMeta) return 'faker not found in metadata';
          const isBlue = blueMeta.some(p => p.participantId === fakerMeta.participantId);
          const participants = isBlue ? last?.blueTeam?.participants : last?.redTeam?.participants;
          const fakerFrame = participants?.find(p => p.participantId === fakerMeta.participantId);
          return { kills: fakerFrame?.kills, deaths: fakerFrame?.deaths, assists: fakerFrame?.assists, cs: fakerFrame?.creepScore };
        })()
      };
    }
  } catch(e) { R.may8_error = e.message; }

  // Step 5: Try getStatsByTournament with correct completed tournament
  try {
    // Try the 2025 split 2 (definitely completed)
    const r = await fetch(`${ESB}/getStatsByTournament?hl=en-US&tournamentId=113503260417890076`, { headers: { 'x-api-key': KEY } });
    const text = await r.text();
    R.stats_endpoint_2025 = { status: r.status, preview: text.slice(0, 600) };
  } catch(e) { R.stats_endpoint_error = e.message; }

  return res.status(200).json(R);
}
