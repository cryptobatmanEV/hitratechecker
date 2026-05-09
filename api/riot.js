const KEY = process.env.RIOT_API_KEY;

function getRouting(region) {
  const r = region.toLowerCase();
  if (['kr','jp'].includes(r)) return 'asia';
  if (['euw','eune','tr','ru'].includes(r)) return 'europe';
  return 'americas';
}

function getPlatform(region) {
  const map = { na:'na1', br:'br1', lan:'la1', las:'la2', oce:'oc1', kr:'kr', jp:'jp1', euw:'euw1', eune:'eun1', tr:'tr1', ru:'ru1' };
  return map[region.toLowerCase()] || 'na1';
}

async function riotFetch(url) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Riot ${r.status}: ${t.slice(0,150)}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!KEY) return res.status(500).json({ error: 'RIOT_API_KEY not set in Vercel environment variables' });

  const { action, game, gameName, tagLine, summonerName, puuid, region = 'na', scope = 'season' } = req.query;
  const routing = getRouting(region);
  const platform = getPlatform(region);

  try {
    // ── LoL summoner search (by name, no #tag needed) ─────────────────────
    if (action === 'search' && game === 'lol') {
      const d = await riotFetch(
        `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`
      );
      return res.json({
        players: [{
          id: d.puuid,
          name: d.name,
          sub: `Level ${d.summonerLevel} · ${region.toUpperCase()}`
        }]
      });
    }

    // ── Riot account lookup by GameName#TagLine (Valorant + LoL fallback) ─
    if (action === 'lookup') {
      const d = await riotFetch(
        `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
      );
      return res.json({ puuid: d.puuid, gameName: d.gameName, tagLine: d.tagLine });
    }

    // ── LoL game log ──────────────────────────────────────────────────────
    if (action === 'gamelog' && game === 'lol') {
      const count = scope === 'career' ? 40 : 20;
      const matchIds = await riotFetch(
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${count}&type=ranked`
      );
      const games = [];
      for (let i = 0; i < Math.min(matchIds.length, 20); i += 5) {
        const batch = matchIds.slice(i, i + 5);
        const details = await Promise.all(
          batch.map(id => riotFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`).catch(() => null))
        );
        for (const match of details) {
          if (!match) continue;
          const p = match.info.participants.find(x => x.puuid === puuid);
          if (!p) continue;
          games.push({
            kills: p.kills, deaths: p.deaths, assists: p.assists,
            cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
            damage: p.totalDamageDealtToChampions,
            champion: p.championName, win: p.win,
            _date: new Date(match.info.gameStartTimestamp).toISOString().split('T')[0],
            _opp: '', _mins: Math.floor(match.info.gameDuration / 60),
          });
        }
      }
      return res.json({ games });
    }

    // ── Valorant game log ─────────────────────────────────────────────────
    if (action === 'gamelog' && game === 'valorant') {
      const matchList = await riotFetch(
        `https://${routing}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${puuid}`
      );
      const ids = (matchList.history || []).slice(0, 20).map(m => m.matchId);
      const games = [];
      for (let i = 0; i < ids.length; i += 5) {
        const batch = ids.slice(i, i + 5);
        const details = await Promise.all(
          batch.map(id => riotFetch(`https://${routing}.api.riotgames.com/val/match/v1/matches/${id}`).catch(() => null))
        );
        for (const match of details) {
          if (!match) continue;
          const p = match.players?.find(x => x.puuid === puuid);
          if (!p) continue;
          const s = p.stats;
          const total = (s.headShots || 0) + (s.bodyShots || 0) + (s.legShots || 0);
          const rounds = match.teams?.reduce((a, t) => a + (t.roundsWon || 0), 0) || 1;
          games.push({
            kills: s.kills, deaths: s.deaths, assists: s.assists,
            acs: Math.round(s.score / rounds),
            headshots: s.headShots || 0,
            hsPct: total > 0 ? Math.round((s.headShots || 0) / total * 100) : 0,
            win: match.teams?.find(t => t.teamId === p.teamId)?.won || false,
            _date: new Date(match.matchInfo?.gameStartMillis || 0).toISOString().split('T')[0],
            _opp: '',
          });
        }
      }
      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
