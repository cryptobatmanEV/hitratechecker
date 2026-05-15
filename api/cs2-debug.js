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
  const out = { key_set: !!KEY, steps: {} };

  // Step 1: search NiKo
  try {
    const d = await cdQ(`{ players(filter:{nickname:{equals:"NiKo"}},first:5){ edges{ node{ id nickname title{id} team{id name} } } } }`);
    out.steps.search = d;
  } catch(e) { out.steps.search = { error: e.message }; }

  // Step 2: stats for NiKo CS:GO profile (7190)
  try {
    const d = await stQ(`{ playerStatistics(playerId:"7190",filter:{timeWindow:LAST_MONTH}){ aggregationSeriesIds series{ count kills{sum} deaths{sum} ... on CsgoPlayerSeriesStatistics{ headshots{sum} } } } }`);
    out.steps.stats = d;
  } catch(e) { out.steps.stats = { error: e.message }; }

  // Step 3: series metadata for first confirmed ID
  try {
    const ids = out.steps.stats?.data?.playerStatistics?.aggregationSeriesIds || [];
    if (ids.length) {
      const d = await cdQ(`{ s0: series(id:"${ids[0]}") { id startTimeScheduled tournament{id name} teams{baseInfo{id name}} } }`);
      out.steps.meta = d;
    } else {
      out.steps.meta = { skipped: 'no series IDs from stats' };
    }
  } catch(e) { out.steps.meta = { error: e.message }; }

  return res.json(out);
}
