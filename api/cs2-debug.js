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

  // Get device's series IDs
  const sd = await stQ(`{ playerStatistics(playerId:"3455",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds } }`);
  const ids = sd?.data?.playerStatistics?.aggregationSeriesIds || [];

  // Get metadata for first 8 series — show tournament names
  const fields = ids.slice(0,8).map((id,i) =>
    `s${i}: series(id:"${id}") { id startTimeScheduled tournament{ id name } teams{ baseInfo{ id name } } }`
  ).join('\n');
  const md = await cdQ(`{ ${fields} }`);

  return res.json({ totalIds: ids.length, seriesIds: ids.slice(0,8), meta: md?.data });
}
