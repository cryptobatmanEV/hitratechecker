export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const CD = 'https://api-op.grid.gg/central-data/graphql';
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

const PLAYER_FIELDS = `
  id name kills deaths killAssistsGiven
  ... on SeriesPlayerStateCs2 { headshots }
  ... on SeriesPlayerStateCsgo { headshots }
`;
const GAME_PLAYER_FIELDS = `
  id name kills deaths killAssistsGiven
  ... on GamePlayerStateCs2 { headshots }
  ... on GamePlayerStateCsgo { headshots }
`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Step 1: Get Techno's last 5 series IDs from Statistics Feed
  const sf = await fetch('https://api-op.grid.gg/statistics-feed/graphql', {
    method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY},
    body: JSON.stringify({query:`{ playerStatistics(playerId:"118726",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds } }`})
  }).then(r=>r.json());
  const ids = (sf?.data?.playerStatistics?.aggregationSeriesIds||[]).slice(0,5);
  out.seriesIds = ids;

  // Step 2: Batch query all 5 series in ONE request using aliases
  const t = Date.now();
  const batchQuery = `{
    ${ids.map((id,i) => `
      s${i}: seriesState(id:"${id}") {
        id startedAt finished
        teams {
          id name won score
          players { ${PLAYER_FIELDS} }
        }
        games {
          sequenceNumber finished map { name }
          teams {
            id name won
            players { ${GAME_PLAYER_FIELDS} }
          }
        }
      }
    `).join('\n')}
  }`;
  const batch = await ssQ(batchQuery);
  out.batchMs = Date.now() - t;
  out.batchError = batch?.errors?.[0]?.message;

  // Step 3: Extract Techno's stats (team 51177, name contains "Techno")
  if (batch?.data) {
    out.technoStats = Object.values(batch.data).map(s => {
      if (!s) return null;
      const team = s.teams?.find(t => t.id === '51177');
      const player = team?.players?.find(p => p.name?.toLowerCase().includes('techno'));
      const opp = s.teams?.find(t => t.id !== '51177')?.name;
      const maps = s.games?.map(g => {
        const gt = g.teams?.find(t => t.id === '51177');
        const gp = gt?.players?.find(p => p.name?.toLowerCase().includes('techno'));
        return { map: g.map?.name, kills: gp?.kills, deaths: gp?.deaths, hs: gp?.headshots };
      });
      return {
        date: s.startedAt?.split('T')[0],
        opp,
        win: team?.won,
        kills: player?.kills,
        deaths: player?.deaths,
        hs: player?.headshots,
        maps
      };
    }).filter(Boolean);
  }

  return res.json(out);
}
