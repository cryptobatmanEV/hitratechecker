export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const ESB  = 'https://esports-api.lolesports.com/persisted/gw';
  const FEED = 'https://feed.lolesports.com/livestats/v1';
  const R = {};

  // LCK Split 1 2026 (Jan 13 - Mar 1 2026) tournament ID confirmed from earlier debug
  const SPLIT1_ID = '115548106590082745';

  // Step 1: Get Split 1 schedule and find a T1 match
  try {
    const r = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058&tournamentId=${SPLIT1_ID}`, {
      headers: { 'x-api-key': KEY }
    });
    const d = await r.json();
    const events = d.data?.schedule?.events || [];
    const t1 = events.filter(e => e.state === 'completed' && (e.match?.teams||[]).some(t=>t.code==='T1')).slice(0,3);
    R.split1_t1_matches = t1.map(e => ({ id: e.match?.id, date: e.startTime, teams: e.match?.teams?.map(t=>t.code) }));
  } catch(e) { R.split1_error = e.message; }

  // Step 2: Get game ID from a Split 1 T1 match
  if (R.split1_t1_matches?.length) {
    try {
      const matchId = R.split1_t1_matches[0].id;
      const matchDate = R.split1_t1_matches[0].date.split('T')[0];
      const r = await fetch(`${ESB}/getEventDetails?hl=en-US&id=${matchId}`, { headers: { 'x-api-key': KEY } });
      const d = await r.json();
      const games = (d.data?.event?.match?.games || []).filter(g => g.state === 'completed');
      R.split1_game = { gameId: games[0]?.id, date: matchDate };

      // Step 3: Test if the feed still has this old game
      if (games[0]?.id) {
        const feedR = await fetch(`${FEED}/window/${games[0].id}?startingTime=${matchDate}T23:59:50.000Z`);
        const feedD = await feedR.json();
        const frames = feedD.frames || [];
        const last = frames[frames.length - 1];
        const blueMeta = feedD.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
        const redMeta  = feedD.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
        const faker = [...blueMeta,...redMeta].find(p=>(p.summonerName||'').toLowerCase().includes('faker'));
        const isBlue = blueMeta.some(p=>p.participantId===faker?.participantId);
        const parts = (isBlue ? last?.blueTeam?.participants : last?.redTeam?.participants)||[];
        const frame = parts.find(p=>p.participantId===faker?.participantId);
        R.split1_feed = {
          status: feedR.status,
          frameCount: frames.length,
          faker_kills: frame?.kills ?? 'not found',
          faker_deaths: frame?.deaths ?? 'not found',
          faker_cs: frame?.creepScore ?? 'not found',
          champion: faker?.championId ?? 'not found'
        };
      }
    } catch(e) { R.split1_game_error = e.message; }
  }

  // Step 4: Also test LCK Split 2 2025 (even older - Apr-Jun 2025)
  try {
    const SPLIT2_2025 = '113503260417890076';
    const r = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058&tournamentId=${SPLIT2_2025}`, {
      headers: { 'x-api-key': KEY }
    });
    const d = await r.json();
    const events = d.data?.schedule?.events || [];
    const t1 = events.filter(e => e.state === 'completed' && (e.match?.teams||[]).some(t=>t.code==='T1')).slice(0,1);
    if (t1[0]) {
      const evR = await fetch(`${ESB}/getEventDetails?hl=en-US&id=${t1[0].match?.id}`, { headers: { 'x-api-key': KEY } });
      const evD = await evR.json();
      const games = (evD.data?.event?.match?.games||[]).filter(g=>g.state==='completed');
      if (games[0]) {
        const matchDate = t1[0].startTime.split('T')[0];
        const feedR = await fetch(`${FEED}/window/${games[0].id}?startingTime=${matchDate}T23:59:50.000Z`);
        R.split2_2025_feed = { status: feedR.status, date: matchDate, gameId: games[0].id };
      }
    }
  } catch(e) { R.split2_2025_error = e.message; }

  return res.status(200).json(R);
}
