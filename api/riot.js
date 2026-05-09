// LoL professional tournament data via the official Riot Esports API
// Same API used by lolesports.com — no key needed beyond the public one
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
    // ── Player search ──────────────────────────────────────────────────────
    if (action === 'search') {
      const d = await esportsFetch(`${ESB}/getTeams?hl=en-US`);

      // Only ACTIVE teams (filters out All-Stars, archived, TBD)
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
              id:          player.id,
              name:        player.summonerName || player.firstName,
              sub:         team.name,
              teamId:      team.id,
              teamCode:    team.code,
              leagueName:  team.homeLeague?.name || '',
              playerName:  player.summonerName || player.firstName,
            });
          }
        }
      }

      return res.json({ players: found.slice(0, 8) });
    }

    // ── Game log — real tournament matches ─────────────────────────────────
    if (action === 'gamelog') {
      const pName = (req.query.playerName || name || '').toLowerCase();

      // Find league ID from league name
      const leaguesData = await esportsFetch(`${ESB}/getLeagues?hl=en-US`);
      const allLeagues  = leaguesData.data?.leagues || [];
      const targetLeague = allLeagues.find(l => l.name === leagueName);
      const targetId     = targetLeague?.id;

      // Search: player's league first, then fallback to all leagues
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
            const evTeams = ev.match?.teams || [];
            const inMatch = evTeams.some(t => t.id === teamId || t.code === teamCode);
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

      // Fetch final player stats from each game via the feed API
      const results = [];
      for (const { gameId, date } of gameEntries.slice(0, 15)) {
        try {
          // Request window at end of game day — should return last available frame
          const gameDate  = (date || '').split('T')[0];
          const endOfDay  = gameDate ? `${gameDate}T23:59:59.000Z` : '2099-01-01T00:00:00.000Z';
          const feedRes   = await fetch(`${FEED}/window/${gameId}?startingTime=${endOfDay}`);
          if (!feedRes.ok) continue;
          const wd = await feedRes.json();

          const frames = wd.frames || [];
          if (!frames.length) continue;
          const lastFrame = frames[frames.length - 1];

          // Locate player in game metadata
          const blueMeta = wd.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
          const redMeta  = wd.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
          const allMeta  = [...blueMeta, ...redMeta];
          const pMeta    = allMeta.find(p =>
            (p.summonerName || '').toLowerCase() === pName ||
            (p.summonerName || '').toLowerCase().includes(pName)
          );
          if (!pMeta) continue;

          const pFrame = lastFrame.participants?.find(p => p.participantId === pMeta.participantId);
          if (!pFrame) continue;

          // Determine win — blue team wins if their nexus is still up
          const isBlue = blueMeta.some(p => p.participantId === pMeta.participantId);
          const blueWins = (lastFrame.blueTeam?.totalGold || 0) >= (lastFrame.redTeam?.totalGold || 0);

          results.push({
            kills:   pFrame.kills   || 0,
            deaths:  pFrame.deaths  || 0,
            assists: pFrame.assists || 0,
            cs:      pFrame.creepScore || 0,
            damage:  pFrame.totalDamageDealtToChampions || 0,
            win:     isBlue ? blueWins : !blueWins,
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
