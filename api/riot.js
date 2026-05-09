const KEY = process.env.RIOT_API_KEY;
const ROUTINGS = ['americas', 'asia', 'europe'];
const COMMON_TAGS = ['NA1','EUW','KR1','EUNE','BR1','JP1','OC1','TR1','LA1','LA2','PH2','SG2','TH2','TW2','VN2'];

async function riotFetch(url) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Try to find a player across all routings. Returns {puuid, gameName, tagLine, routing}
async function findAccount(gameName, tagLine) {
  const attempts = ROUTINGS.map(routing =>
    riotFetch(`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`)
      .then(d => ({ ...d, routing }))
      .catch(() => null)
  );
  const results = await Promise.all(attempts);
  return results.find(r => r?.puuid) || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!KEY) return res.status(500).json({ error: 'RIOT_API_KEY not set' });

  const { action, game, name, puuid, routing = 'americas', scope = 'season' } = req.query;

  try {
    // ── Search player (LoL or Valorant) ────────────────────────────────────
    if (action === 'search') {
      let found = null;

      if (name.includes('#')) {
        // Full Riot ID — try all routings
        const [gName, tLine] = name.split('#');
        found = await findAccount(gName.trim(), tLine.trim());
      } else {
        // Name only — try all common tags across all routings in parallel
        const attempts = [];
        for (const routing of ROUTINGS) {
          for (const tag of COMMON_TAGS) {
            attempts.push(
              riotFetch(`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag)}`)
                .then(d => ({ ...d, routing }))
                .catch(() => null)
            );
          }
        }
        const results = await Promise.all(attempts);
        found = results.find(r => r?.puuid) || null;
      }

      if (!found) {
        return res.status(404).json({
          error: `Player not found. Try using their full Riot ID (Name#Tag). Find it at op.gg or tracker.gg.`
        });
      }

      return res.json({
        players: [{
          id: found.puuid,
          name: `${found.gameName}#${found.tagLine}`,
          sub: found.routing.toUpperCase(),
          routing: found.routing
        }]
      });
    }

    // ── LoL game log ──────────────────────────────────────────────────────
    if (action === 'gamelog' && game === 'lol') {
      const count = scope === 'career' ? 40 : 20;
      const matchIds = await riotFetch(
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${count}&type=ranked`
      );
      const games = [];
      for (let i = 0; i < Math.min(matchIds.length, 20); i += 5) {
        const details = await Promise.all(
          matchIds.slice(i, i + 5).map(id =>
            riotFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`).catch(() => null)
          )
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
            _opp: '',
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
        const details = await Promise.all(
          ids.slice(i, i + 5).map(id =>
            riotFetch(`https://${routing}.api.riotgames.com/val/match/v1/matches/${id}`).catch(() => null)
          )
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
