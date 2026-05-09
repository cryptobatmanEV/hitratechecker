// LoL professional tournament data via the official Riot Esports API
const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const ESB  = 'https://esports-api.lolesports.com/persisted/gw';
const FEED = 'https://feed.lolesports.com/livestats/v1';

async function esportsFetch(url) {
  const r = await fetch(url, { headers: { 'x-api-key': KEY, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`LoL Esports ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, name, teamId, teamCode, leagueName } = req.query;

  try {
    // ── Player search — active pro teams only ──────────────────────────────
    if (action === 'search') {
      const d = await esportsFetch(`${ESB}/getTeams?hl=en-US`);
      const teams = (d.data?.teams || []).filter(t =>
        t.status === 'active' && t.name && t.name !== 'TBD'
      );

      const nameLower = name.toLowerCase().trim();
      const found = [];

      for (const team of teams) {
        for (const player of team.players || []) {
          const sn = (player.summonerName || player.firstName || '').toLowerCase();
          if (sn.includes(nameLower)) {
            found.push({
              id:         player.id,
              name:       player.summonerName || player.firstName,
              sub:        team.name,
              teamId:     team.id,
              teamCode:   team.code,
              leagueName: team.homeLeague?.name || '',
              playerName: player.summonerName || player.firstName,
            });
          }
        }
      }

      return res.json({ players: found.slice(0, 8) });
    }

    // ── Game log — real tournament matches via confirmed feed structure ─────
    if (action === 'gamelog') {
      const pName = (req.query.playerName || name || '').toLowerCase();

      // Find this player's league ID
      const leaguesData = await esportsFetch(`${ESB}/getLeagues?hl=en-US`);
      const allLeagues  = leaguesData.data?.leagues || [];
      const targetLeague = allLeagues.find(l => l.name === leagueName);
      const targetId     = targetLeague?.id;

      const leagueOrder = targetId
        ? [targetId, ...allLeagues.filter(l => l.id !== targetId).map(l => l.id).slice(0, 12)]
        : allLeagues.map(l => l.id).slice(0, 15);

      // Find completed matches for this team
      const eventIds = [];
      for (const lid of leagueOrder) {
        if (eventIds.length >= 10) break;
        try {
          const sched  = await esportsFetch(`${ESB}/getSchedule?hl=en-US&leagueId=${lid}`);
          const events = sched.data?.schedule?.events || [];
          for (const ev of events) {
            if (ev.state !== 'completed') continue;
            const inMatch = (ev.match?.teams || []).some(t => t.id === teamId || t.code === teamCode);
            if (inMatch && ev.match?.id) {
              eventIds.push({ id: ev.match.id, date: ev.startTime });
              if (eventIds.length >= 10) break;
            }
          }
        } catch(e) { continue; }
      }

      // Get individual game IDs from each match
      const gameEntries = [];
      for (const { id: evId, date } of eventIds) {
        if (gameEntries.length >= 20) break;
        try {
          const evData = await esportsFetch(`${ESB}/getEventDetails?hl=en-US&id=${evId}`);
          const games  = evData.data?.event?.match?.games || [];
          for (const g of games) {
            if (g.state === 'completed' && g.id) {
              gameEntries.push({ gameId: g.id, date });
            }
          }
        } catch(e) { continue; }
      }

      // Fetch stats for each game
      const results = [];

      for (const { gameId, date } of gameEntries.slice(0, 15)) {
        try {
          const gameDate = (date || '').split('T')[0];

          // Feed API requires startingTime divisible by 10 seconds (confirmed)
          // Request end-of-day so we get the last frames (final stats)
          const feedUrl = `${FEED}/window/${gameId}?startingTime=${gameDate}T23:59:50.000Z`;
          const feedRes = await fetch(feedUrl);
          if (!feedRes.ok) continue;
          const wd = await feedRes.json();

          const frames = wd.frames || [];
          if (!frames.length) continue;
          const lastFrame = frames[frames.length - 1];

          // Confirmed structure: participants are inside blueTeam / redTeam
          const blueParticipants = lastFrame.blueTeam?.participants || [];
          const redParticipants  = lastFrame.redTeam?.participants  || [];

          // Find player in metadata — names are "TEAM PlayerName" e.g. "HLE Zeus"
          const blueMeta = wd.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
          const redMeta  = wd.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
          const allMeta  = [...blueMeta, ...redMeta];

          const pMeta = allMeta.find(p =>
            (p.summonerName || '').toLowerCase() === pName ||
            (p.summonerName || '').toLowerCase().includes(pName)
          );
          if (!pMeta) continue;

          // Confirmed field names: kills, deaths, assists, creepScore
          const isBlue = blueMeta.some(p => p.participantId === pMeta.participantId);
          const pFrame = (isBlue ? blueParticipants : redParticipants)
            .find(p => p.participantId === pMeta.participantId);
          if (!pFrame) continue;

          // Win: team with more totalGold won
          const blueGold = lastFrame.blueTeam?.totalGold || 0;
          const redGold  = lastFrame.redTeam?.totalGold  || 0;
          const win = isBlue ? blueGold >= redGold : redGold > blueGold;

          results.push({
            kills:   pFrame.kills      || 0,
            deaths:  pFrame.deaths     || 0,
            assists: pFrame.assists    || 0,
            cs:      pFrame.creepScore || 0,
            damage:  0, // not in window feed; use details endpoint if needed
            win,
            _date:   gameDate,
            _opp:    '',
          });
        } catch(e) { continue; }
      }

      return res.json({ games: results });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
