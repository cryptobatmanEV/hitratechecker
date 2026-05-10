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

    // ── Game log ───────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const pName = (req.query.playerName || name || '').toLowerCase();

      // Find league ID
      const leaguesData = await esportsFetch(`${ESB}/getLeagues?hl=en-US`);
      const targetLeague = (leaguesData.data?.leagues || []).find(l => l.name === leagueName);
      if (!targetLeague) return res.json({ games: [], error: `League "${leagueName}" not found` });

      // Paginate schedule — collect up to 50 team matches across all available pages
      // Debug confirmed: 8 pages, 130 T1 matches from June 2023 to May 2026
      // Stop once we have 50 matches (covers ~Jan 2025 to present = ~4 splits)
      const teamEvents = [];
      let pageToken = null;

      while (teamEvents.length < 50) {
        const url = pageToken
          ? `${ESB}/getSchedule?hl=en-US&leagueId=${targetLeague.id}&pageToken=${encodeURIComponent(pageToken)}`
          : `${ESB}/getSchedule?hl=en-US&leagueId=${targetLeague.id}`;

        const sched  = await esportsFetch(url);
        const events = sched.data?.schedule?.events || [];
        const pages  = sched.data?.schedule?.pages;

        const matching = events.filter(ev =>
          ev.state === 'completed' &&
          (ev.match?.teams || []).some(t => t.id === teamId || t.code === teamCode)
        );

        for (const ev of matching) {
          const opp = (ev.match?.teams || []).find(t => t.id !== teamId && t.code !== teamCode);
          teamEvents.push({
            id:   ev.match.id,
            date: ev.startTime,
            opp:  opp?.code || opp?.name || '',
          });
          if (teamEvents.length >= 50) break;
        }

        pageToken = pages?.older || null;
        if (!pageToken) break;
      }

      if (!teamEvents.length) return res.json({ games: [], error: `No completed matches found for ${teamCode}` });

      // Get game IDs for all collected matches in parallel
      const eventDetails = await Promise.all(
        teamEvents.map(({ id: evId, date, opp }) =>
          esportsFetch(`${ESB}/getEventDetails?hl=en-US&id=${evId}`)
            .then(d => ({
              games: (d.data?.event?.match?.games || [])
                .filter(g => g.state === 'completed')
                .map((g, idx) => ({ gameId: g.id, date, opp, gameNum: idx + 1 })),
            }))
            .catch(() => ({ games: [] }))
        )
      );

      // Take the 80 most recent games (already ordered newest→oldest from schedule)
      const gameEntries = eventDetails.flatMap(e => e.games).slice(0, 80);
      if (!gameEntries.length) return res.json({ games: [], error: 'No completed games found' });

      // Fetch feed windows in parallel batches of 5
      const results = [];

      for (let i = 0; i < gameEntries.length; i += 5) {
        const batch = gameEntries.slice(i, i + 5);
        const feedResults = await Promise.all(
          batch.map(({ gameId, date }) => {
            const gameDate = (date || '').split('T')[0];
            return fetch(`${FEED}/window/${gameId}?startingTime=${gameDate}T23:59:50.000Z`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null);
          })
        );

        for (let j = 0; j < feedResults.length; j++) {
          const wd = feedResults[j];
          if (!wd) continue;
          const frames = wd.frames || [];
          if (!frames.length) continue;
          const lastFrame = frames[frames.length - 1];

          const blueMeta = wd.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
          const redMeta  = wd.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
          const pMeta    = [...blueMeta, ...redMeta].find(p =>
            (p.summonerName || '').toLowerCase().includes(pName)
          );
          if (!pMeta) continue;

          const isBlue  = blueMeta.some(p => p.participantId === pMeta.participantId);
          const pFrame  = (isBlue ? lastFrame.blueTeam?.participants : lastFrame.redTeam?.participants)
            ?.find(p => p.participantId === pMeta.participantId);
          if (!pFrame) continue;

          const blueGold = lastFrame.blueTeam?.totalGold || 0;
          const redGold  = lastFrame.redTeam?.totalGold  || 0;
          const win = isBlue ? blueGold >= redGold : redGold > blueGold;

          results.push({
            kills:    pFrame.kills      || 0,
            deaths:   pFrame.deaths     || 0,
            assists:  pFrame.assists    || 0,
            cs:       pFrame.creepScore || 0,
            champion: pMeta.championId  || '',
            win,
            _date:    batch[j].date.split('T')[0],
            _opp:     batch[j].opp || '',
          });
        }
      }

      // Newest first
      results.sort((a, b) => b._date.localeCompare(a._date));

      return res.json({ games: results });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
