export const config = { maxDuration: 30 };

const CD    = 'https://api-op.grid.gg/central-data/graphql';
const SS    = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const KEY   = process.env.GRID_API_KEY;

async function cdQ(q) {
  const r = await fetch(CD, {method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});
  return r.json();
}
async function ssQ(q) {
  const r = await fetch(SS, {method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});
  return r.json();
}

// Find player across all teams in a series state by name match
function findPlayer(seriesState, slug) {
  for (const team of seriesState.teams || []) {
    const player = team.players?.find(p => p.name?.toLowerCase().includes(slug));
    if (player) return { player, team, opp: seriesState.teams.find(t => t.id !== team.id)?.name || '?' };
  }
  return null;
}

const SP_FIELDS = `id name kills deaths killAssistsGiven
  ... on SeriesPlayerStateCs2 { headshots }
  ... on SeriesPlayerStateCsgo { headshots }`;

const GP_FIELDS = `id name kills deaths killAssistsGiven
  ... on GamePlayerStateCs2 { headshots }
  ... on GamePlayerStateCsgo { headshots }`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, playerId } = req.query;
  const nickname = req.query.nickname || req.query.q || '';

  try {
    // ── SEARCH ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      const safe = nickname.replace(/"/g, '');
      for (const f of [`equals:"${safe}"`, `contains:"${safe}"`]) {
        const d = await cdQ(`{
          players(filter:{nickname:{${f}}},first:10) {
            edges { node { id nickname title{id} team{id name} } }
          }
        }`);
        const all = d?.data?.players?.edges?.map(e => e.node) || [];
        if (!all.length) continue;
        // Group by nickname, prefer CS2 profile (title 28)
        const groups = {};
        for (const p of all) {
          const k = p.nickname.toLowerCase();
          if (!groups[k]) groups[k] = [];
          groups[k].push(p);
        }
        const players = [];
        for (const profiles of Object.values(groups)) {
          const cs2  = profiles.find(p => p.title?.id === '28');
          const csgo = profiles.find(p => p.title?.id === '1');
          const any  = profiles[0];
          const base = cs2 || csgo || any;
          const teamName = base.team?.name || 'N/A';
          players.push({
            id: `grid_${base.id}_${base.team?.id || '0'}_${base.nickname}`,
            name: base.nickname,
            sub: `CS2 · ${teamName}`
          });
        }
        if (players.length) return res.json({ players });
      }
      return res.json({ players: [] });
    }

    // ── GAMELOG ───────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts    = (playerId || '').split('_');
      const gridId   = parts[1];
      const teamId   = parts[2];
      const slug     = parts.slice(3).join('_').toLowerCase();
      if (!gridId) return res.status(400).json({ error: 'Invalid player ID' });

      // Step 1: Get ALL series for team from Central Data (comprehensive coverage)
      const cd = await cdQ(`{
        allSeries(filter:{teamIds:{in:[""]}}, first:50) {
          edges { node { id startTimeScheduled } }
        }
      }`);
      const allSeriesList = (cd?.data?.allSeries?.edges || [])
        .map(e => e.node)
        .filter(s => s.startTimeScheduled)
        .sort((a,b) => new Date(b.startTimeScheduled) - new Date(a.startTimeScheduled));
      const ids = allSeriesList.slice(0, 20).map(s => s.id);
      if (!ids.length) return res.json({ games: [] });

      // Step 2: Batch query all series states in ONE request
      const batchQuery = `{
        ${ids.map((id, i) => `
          s${i}: seriesState(id:"${id}") {
            id startedAt finished
            teams {
              id name won score
              players { ${SP_FIELDS} }
            }
            games {
              sequenceNumber finished
              map { name }
              teams {
                id name won
                players { ${GP_FIELDS} }
              }
            }
          }
        `).join('\n')}
      }`;
      const batch = await ssQ(batchQuery);
      if (!batch?.data) return res.json({ games: [] });

      // Step 3: Build game log
      const games = Object.values(batch.data)
        .filter(Boolean)
        .map(s => {
          const found = findPlayer(s, slug);
          if (!found) return null;
          const { player, team, opp } = found;

          // Per-map breakdown
          const maps = (s.games || [])
            .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
            .map(g => {
              const gt = g.teams?.find(t => t.id === team.id);
              const gp = gt?.players?.find(p => p.name?.toLowerCase().includes(slug));
              return {
                kills:     gp?.kills     || 0,
                deaths:    gp?.deaths    || 0,
                assists:   gp?.killAssistsGiven || 0,
                headshots: gp?.headshots || 0,
                map:       g.map?.name   || ''
              };
            });

          return {
            kills:     player.kills     || 0,
            deaths:    player.deaths    || 0,
            assists:   player.killAssistsGiven || 0,
            headshots: player.headshots || 0,
            win:       team.won,
            maps,
            _date: s.startedAt?.split('T')[0] || '',
            _opp:  opp
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b._date) - new Date(a._date));

      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
