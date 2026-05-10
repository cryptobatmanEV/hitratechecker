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
    if (action === 'search') {
      const d = await esportsFetch(`${ESB}/getTeams?hl=en-US`);
      const teams = (d.data?.teams || []).filter(t => t.status === 'active' && t.name && t.name !== 'TBD');
      const nameLower = name.toLowerCase().trim();
      const found = [];
      for (const team of teams) {
        for (const player of team.players || []) {
          const sn = (player.summonerName || player.firstName || '').toLowerCase();
          if (sn.includes(nameLower)) {
            found.push({
              id: player.id, name: player.summonerName || player.firstName,
              sub: team.name, teamId: team.id, teamCode: team.code,
              leagueName: team.homeLeague?.name || '',
              playerName: player.summonerName || player.firstName,
            });
          }
        }
      }
      return res.json({ players: found.slice(0, 8) });
    }

    if (action === 'gamelog') {
      const pName = (req.query.playerName || name || '').toLowerCase();

      const leaguesData = await esportsFetch(`${ESB}/getLeagues?hl=en-US`);
      const targetLeague = (leaguesData.data?.leagues || []).find(l => l.name === leagueName);
      if (!targetLeague) return res.json({ games: [], error: `League "${leagueName}" not found` });

      // Paginate schedule to collect up to 50 team matches
      const teamEvents = [];
      let pageToken = null;

      while (teamEvents.length < 50) {
        const url = pageToken
          ? `${ESB}/getSchedule?hl=en-US&leagueId=${targetLeague.id}&pageToken=${encodeURIComponent(pageToken)}`
          : `${ESB}/getSchedule?hl=en-US&leagueId=${targetLeague.id}`;
        const sched  = await esportsFetch(url);
        const events = sched.data?.schedule?.events || [];
        const pages  = sched.data?.schedule?.pages;

        for (const ev of events) {
          if (ev.state !== 'completed') continue;
          if (!(ev.match?.teams || []).some(t => t.id === teamId || t.code === teamCode)) continue;
          const opp = (ev.match?.teams || []).find(t => t.id !== teamId && t.code !== teamCode);
          teamEvents.push({ matchId: ev.match.id, date: ev.startTime, opp: opp?.code || '' });
          if (teamEvents.length >= 50) break;
        }

        pageToken = pages?.older || null;
        if (!pageToken) break;
      }

      if (!teamEvents.length) return res.json({ games: [], error: `No completed matches found for ${teamCode}` });

      // Get all game IDs in parallel — track which matchId each game belongs to
      const eventDetails = await Promise.all(
        teamEvents.map(({ matchId, date, opp }) =>
          esportsFetch(`${ESB}/getEventDetails?hl=en-US&id=${matchId}`)
            .then(d => ({
              games: (d.data?.event?.match?.games || [])
                .filter(g => g.state === 'completed')
                .map((g, mapNum) => ({ gameId: g.id, matchId, date, opp, mapNum })),
            }))
            .catch(() => ({ games: [] }))
        )
      );

      const gameEntries = eventDetails.flatMap(e => e.games).slice(0, 100);
      if (!gameEntries.length) return res.json({ games: [], error: 'No completed games found' });

      // Fetch feed windows in parallel batches of 5
      // Store raw per-game results with matchId so we can aggregate per series
      const rawResults = [];

      for (let i = 0; i < gameEntries.length; i += 5) {
        const batch = gameEntries.slice(i, i + 5);
        const feedResults = await Promise.all(
          batch.map(({ gameId, date, mapNum }) => {
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
          const gameWin  = isBlue ? blueGold >= redGold : redGold > blueGold;

          rawResults.push({
            matchId:  batch[j].matchId,
            mapNum:   batch[j].mapNum,
            kills:    pFrame.kills      || 0,
            deaths:   pFrame.deaths     || 0,
            assists:  pFrame.assists    || 0,
            cs:       pFrame.creepScore || 0,
            champion: pMeta.championId  || '',
            gameWin,
            _date:    batch[j].date.split('T')[0],
            _opp:     batch[j].opp || '',
          });
        }
      }

      // ── Aggregate per SERIES (sum all games in a match) ──────────────────
      const matchMap = {};
      for (const r of rawResults) {
        if (!matchMap[r.matchId]) {
          matchMap[r.matchId] = {
            kills: 0, deaths: 0, assists: 0, cs: 0,
            wins: 0, games: 0, champions: [],
            maps: {},
            _date: r._date, _opp: r._opp,
          };
        }
        const m = matchMap[r.matchId];
        m.kills   += r.kills;
        m.deaths  += r.deaths;
        m.assists += r.assists;
        m.cs      += r.cs;
        m.wins    += r.gameWin ? 1 : 0;
        m.games   += 1;
        if (r.champion && !m.champions.includes(r.champion)) m.champions.push(r.champion);
        m.maps[r.mapNum] = { kills: r.kills, deaths: r.deaths, assists: r.assists, cs: r.cs };
      }

      const results = Object.values(matchMap)
        .map(m => ({
          kills:    m.kills,
          deaths:   m.deaths,
          assists:  m.assists,
          cs:       m.cs,
          champion: m.champions.join('/'), // e.g. "Ahri/Orianna" for BO2
          win:      m.wins > m.games / 2,
          maps:     Object.entries(m.maps).sort((a,b)=>a[0]-b[0]).map(([,v])=>v),
          _date:    m._date,
          _opp:     m._opp,
        }))
        .sort((a, b) => b._date.localeCompare(a._date)); // newest first

      return res.json({ games: results });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
