const KEY = process.env.RIOT_API_KEY;
const ROUTINGS = ['americas', 'asia', 'europe'];
const COMMON_TAGS = ['NA1','EUW','KR1','EUNE','BR1','JP1','TR1','OC1','LA1','LA2'];

// Valorant uses platform-specific URLs, not routing URLs
function getValPlatform(routing) {
  if (routing === 'asia') return 'ap';
  if (routing === 'europe') return 'eu';
  return 'na'; // americas → na
}

async function riotFetch(url) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function findAccount(gameName, tagLine) {
  const results = await Promise.all(
    ROUTINGS.map(routing =>
      riotFetch(`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`)
        .then(d => ({ ...d, routing }))
        .catch(() => null)
    )
  );
  return results.find(r => r?.puuid) || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!KEY) return res.status(500).json({ error: 'RIOT_API_KEY not set' });

  const { action, game, name, puuid, routing = 'americas', scope = 'season' } = req.query;

  try {
    // ── Player search ─────────────────────────────────────────────────────
    if (action === 'search') {
      let found = null;

      if (name.includes('#')) {
        const [gName, tLine] = name.split('#');
        found = await findAccount(gName.trim(), tLine.trim());
      } else {
        // Try common tags across all routings in parallel
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
          error: `Player not found. Try the full Riot ID format: Name#Tag (e.g. Faker#T1). Find it at op.gg or tracker.gg.`
        });
      }

      const valPlatform = getValPlatform(found.routing);

      return res.json({
        players: [{
          id: found.puuid,
          name: `${found.gameName}#${found.tagLine}`,
          sub: found.routing.toUpperCase(),
          routing: found.routing,
          platform: valPlatform   // stored for Valorant gamelog calls
        }]
      });
    }

    // ── LoL game log (ranked solo queue = 420) ────────────────────────────
    if (action === 'gamelog' && game === 'lol') {
      const count = scope === 'career' ? 40 : 20;
      // Try ranked solo first, fall back to all ranked
      let matchIds = [];
      try {
        matchIds = await riotFetch(
          `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${count}&type=ranked`
        );
      } catch(e) {}

      // If no ranked games, try normal/any recent games
      if (!matchIds.length) {
        try {
          matchIds = await riotFetch(
            `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`
          );
        } catch(e) {}
      }

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
    // Valorant uses platform-specific URLs (na/eu/ap/kr/br/latam), not routing URLs
    if (action === 'gamelog' && game === 'valorant') {
      const platform = req.query.platform || getValPlatform(routing);
      let matchList;
      try {
        matchList = await riotFetch(
          `https://${platform}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${puuid}`
        );
      } catch(e) {
        // Try other platforms if the stored one fails
        for (const p of ['na','eu','ap','kr','br','latam']) {
          try {
            matchList = await riotFetch(`https://${p}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${puuid}`);
            if (matchList) break;
          } catch(e2) { continue; }
        }
      }

      if (!matchList) return res.json({ games: [] });

      const ids = (matchList.history || []).slice(0, 20).map(m => m.matchId);
      const games = [];
      for (let i = 0; i < ids.length; i += 5) {
        const details = await Promise.all(
          ids.slice(i, i + 5).map(id =>
            riotFetch(`https://${platform}.api.riotgames.com/val/match/v1/matches/${id}`).catch(() => null)
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
