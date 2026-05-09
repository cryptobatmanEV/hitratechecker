export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const ESB  = 'https://esports-api.lolesports.com/persisted/gw';
  const FEED = 'https://feed.lolesports.com/livestats/v1';

  // Pull every T1 match from the schedule, get every game, extract Faker's exact stats
  // Then return them in chronological order with opponent so user can verify against gol.gg
  const results = [];
  const errors  = [];

  try {
    // Get LCK schedule
    const sched = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058`, {
      headers: { 'x-api-key': KEY }
    });
    const schedD = await sched.json();
    const events = schedD.data?.schedule?.events || [];

    // Filter completed T1 matches
    const t1Events = events
      .filter(ev => ev.state === 'completed' && (ev.match?.teams||[]).some(t => t.code === 'T1'))
      .slice(0, 12)
      .map(ev => {
        const opp = (ev.match?.teams||[]).find(t => t.code !== 'T1');
        return { id: ev.match.id, date: ev.startTime.split('T')[0], opp: opp?.code || '' };
      });

    // Get game IDs for each match in parallel
    const eventDetails = await Promise.all(
      t1Events.map(({ id, date, opp }) =>
        fetch(`${ESB}/getEventDetails?hl=en-US&id=${id}`, { headers: { 'x-api-key': KEY } })
          .then(r => r.json())
          .then(d => ({
            games: (d.data?.event?.match?.games || [])
              .filter(g => g.state === 'completed')
              .map((g, idx) => ({ gameId: g.id, date, opp, gameNum: idx + 1 }))
          }))
          .catch(e => { errors.push(`event ${id}: ${e.message}`); return { games: [] }; })
      )
    );

    const allGames = eventDetails.flatMap(e => e.games);

    // Fetch all feed windows in parallel batches of 5
    for (let i = 0; i < allGames.length; i += 5) {
      const batch = allGames.slice(i, i + 5);
      const feeds = await Promise.all(
        batch.map(({ gameId, date }) =>
          fetch(`${FEED}/window/${gameId}?startingTime=${date}T23:59:50.000Z`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );

      for (let j = 0; j < feeds.length; j++) {
        const wd = feeds[j];
        const { gameId, date, opp, gameNum } = batch[j];
        if (!wd) { errors.push(`no feed for ${gameId}`); continue; }

        const frames = wd.frames || [];
        if (!frames.length) { errors.push(`no frames for ${gameId}`); continue; }
        const last = frames[frames.length - 1];

        const blueMeta = wd.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
        const redMeta  = wd.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
        const faker    = [...blueMeta, ...redMeta].find(p => (p.summonerName||'').toLowerCase().includes('faker'));

        if (!faker) { errors.push(`faker not in game ${gameId}`); continue; }

        const isBlue = blueMeta.some(p => p.participantId === faker.participantId);
        const parts  = (isBlue ? last.blueTeam?.participants : last.redTeam?.participants) || [];
        const frame  = parts.find(p => p.participantId === faker.participantId);

        if (!frame) { errors.push(`no frame for faker in ${gameId}`); continue; }

        const blueGold = last.blueTeam?.totalGold || 0;
        const redGold  = last.redTeam?.totalGold  || 0;
        const win = isBlue ? blueGold >= redGold : redGold > blueGold;

        results.push({
          date,
          game:     gameNum,
          vs:       opp,
          champion: faker.championId || '',
          kills:    frame.kills    || 0,
          deaths:   frame.deaths   || 0,
          assists:  frame.assists  || 0,
          cs:       frame.creepScore || 0,
          result:   win ? 'W' : 'L',
        });
      }
    }
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }

  // Sort chronologically
  results.sort((a, b) => a.date.localeCompare(b.date) || a.game - b.game);

  return res.status(200).json({ 
    total: results.length, 
    errors, 
    // Group by date for easy comparison against gol.gg
    byDate: results.reduce((acc, r) => {
      if (!acc[r.date]) acc[r.date] = [];
      acc[r.date].push(r);
      return acc;
    }, {})
  });
}
