export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };

  // ── CS2: Show raw competition types for nython's last 5 matches ───────────
  try {
    // 1. Get player ID
    const sr = await fetch('https://open.faceit.com/data/v4/players?nickname=nython&game=cs2', {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const sd = await sr.json();
    const playerId = sd.player_id;

    // 2. Get match history
    const hr = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const hd = await hr.json();

    R.cs2_nython_matches = (hd.items || []).slice(0, 8).map(m => ({
      match_id:         m.match_id,
      competition_type: m.competition_type,
      competition_name: m.competition_name,
      organized_id:     m.organized_id,
      tournament_id:    m.tournament_id,
      date:             m.started_at ? new Date(m.started_at*1000).toISOString().split('T')[0] : '',
    }));
  } catch(e) { R.cs2_error = e.message; }

  // ── LoL: Get a real game ID from LCK schedule and test the feed window ────
  try {
    const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
    const ESB  = 'https://esports-api.lolesports.com/persisted/gw';

    // Get all leagues to find LCK
    const leaguesR = await fetch(`${ESB}/getLeagues?hl=en-US`, { headers: { 'x-api-key': KEY } });
    const leaguesD = await leaguesR.json();
    const lck = (leaguesD.data?.leagues || []).find(l => l.name === 'LCK');
    R.lol_lck_id = lck ? { id: lck.id, name: lck.name } : 'LCK not found';

    if (lck) {
      // Get LCK schedule
      const schedR = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=${lck.id}`, { headers: { 'x-api-key': KEY } });
      const schedD = await schedR.json();
      const events  = schedD.data?.schedule?.events || [];
      const recent  = events.filter(e => e.state === 'completed').slice(0, 3);
      R.lol_lck_recent_matches = recent.map(e => ({ matchId: e.match?.id, teams: e.match?.teams?.map(t=>t.code), date: e.startTime }));

      // Get game IDs from first match
      if (recent[0]?.match?.id) {
        const evR = await fetch(`${ESB}/getEventDetails?hl=en-US&id=${recent[0].match.id}`, { headers: { 'x-api-key': KEY } });
        const evD = await evR.json();
        const games = evD.data?.event?.match?.games || [];
        R.lol_match_games = games.map(g => ({ id: g.id, state: g.state }));

        // Test the feed window with first completed game
        const firstGame = games.find(g => g.state === 'completed');
        if (firstGame) {
          const gameDate = recent[0].startTime?.split('T')[0];
          const endOfDay = `${gameDate}T23:59:59.000Z`;

          const feedR = await fetch(`https://feed.lolesports.com/livestats/v1/window/${firstGame.id}?startingTime=${endOfDay}`);
          R.lol_feed_status  = feedR.status;
          if (feedR.ok) {
            const feedD = await feedR.json();
            const frames = feedD.frames || [];
            const last   = frames[frames.length - 1];
            const blueMeta = feedD.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
            const redMeta  = feedD.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
            R.lol_feed_sample = {
              gameId:      firstGame.id,
              frameCount:  frames.length,
              players:     [...blueMeta, ...redMeta].map(p => ({ name: p.summonerName, id: p.participantId })),
              lastFrameFirstPlayer: last?.participants?.[0],
            };
          } else {
            const txt = await feedR.text();
            R.lol_feed_error = txt.slice(0, 300);
          }
        }
      }
    }
  } catch(e) { R.lol_error = e.message; }

  return res.status(200).json(R);
}
