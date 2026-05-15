export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;

async function cdQ(q) {
  const r = await fetch(CD, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) });
  return r.json();
}
async function stQ(q) {
  const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const name = req.query.name || 'device';

  // 1. Get ALL profiles for this nickname
  const sd = await cdQ(`{ players(filter:{nickname:{equals:"${name}"}},first:10){ edges{ node{ id nickname title{id name} team{id name} } } } }`);
  const profiles = sd?.data?.players?.edges?.map(e => e.node) || [];

  // 2. For each CS:GO profile (title 1), check if they have pro stats
  const checks = [];
  for (const p of profiles) {
    const st = await stQ(`{ playerStatistics(playerId:"${p.id}",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds series{ count kills{sum} } } }`);
    checks.push({
      id: p.id,
      nickname: p.nickname,
      title: p.title?.id,
      team: p.team?.name,
      seriesCount: st?.data?.playerStatistics?.series?.count || 0,
      killsSum: st?.data?.playerStatistics?.series?.kills?.sum || 0,
      sampleSeriesIds: (st?.data?.playerStatistics?.aggregationSeriesIds || []).slice(0,2),
      statsError: st?.errors?.[0]?.message
    });
  }

  return res.json({ searched: name, profiles, checks });
}
