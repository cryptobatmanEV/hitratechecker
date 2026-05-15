export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;

async function cdQuery(q) {
  const r = await fetch(CD, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body: JSON.stringify({query:q}) });
  return r.json();
}
async function statsQuery(q) {
  const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body: JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Can we reach GRID at all?
  try {
    const d = await cdQuery(`{ players(filter: { nickname: { equals: "NiKo" } }, first: 3) { edges { node { id nickname title { id } team { id name } } } } }`);
    results.search = d;
  } catch(e) { results.search = { error: e.message }; }

  // 2. Can we get stats for NiKo CS:GO profile (7190)?
  try {
    const d = await statsQuery(`{ playerStatistics(playerId: "7190", filter: { timeWindow: LAST_MONTH }) { aggregationSeriesIds series { count kills { sum } ... on CsgoPlayerSeriesStatistics { headshots { sum } } } } }`);
    results.stats = d;
  } catch(e) { results.stats = { error: e.message }; }

  return res.json({ key_set: !!KEY, results });
}
