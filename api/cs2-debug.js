export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){
  const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});
  return r.json();
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const pid = req.query.pid || '118726'; // Techno CS2 profile
  const out = {};

  // Test 1: LAST_YEAR (confirmed working)
  const r1 = await stQ(`{ playerStatistics(playerId:"${pid}",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds series{count kills{sum}} } }`);
  out.LAST_YEAR = { count: r1?.data?.playerStatistics?.series?.count, kills: r1?.data?.playerStatistics?.series?.kills?.sum, ids: r1?.data?.playerStatistics?.aggregationSeriesIds?.length, error: r1?.errors?.[0]?.message };

  // Test 2: Does ALL_TIME exist?
  const r2 = await stQ(`{ playerStatistics(playerId:"${pid}",filter:{timeWindow:ALL_TIME}){ aggregationSeriesIds series{count kills{sum}} } }`);
  out.ALL_TIME = { count: r2?.data?.playerStatistics?.series?.count, kills: r2?.data?.playerStatistics?.series?.kills?.sum, ids: r2?.data?.playerStatistics?.aggregationSeriesIds?.length, error: r2?.errors?.[0]?.message };

  // Test 3: Try startedAt date range filter (CS2 launched Oct 2023)
  const r3 = await stQ(`{ playerStatistics(playerId:"${pid}",filter:{startedAt:{gte:"2023-10-01T00:00:00Z"}}){ aggregationSeriesIds series{count kills{sum}} } }`);
  out.startedAt_since_cs2_launch = { count: r3?.data?.playerStatistics?.series?.count, kills: r3?.data?.playerStatistics?.series?.kills?.sum, ids: r3?.data?.playerStatistics?.aggregationSeriesIds?.length, error: r3?.errors?.[0]?.message };

  // Test 4: Try without any filter at all
  const r4 = await stQ(`{ playerStatistics(playerId:"${pid}"){ aggregationSeriesIds series{count kills{sum}} } }`);
  out.no_filter = { count: r4?.data?.playerStatistics?.series?.count, kills: r4?.data?.playerStatistics?.series?.kills?.sum, ids: r4?.data?.playerStatistics?.aggregationSeriesIds?.length, error: r4?.errors?.[0]?.message };

  return res.json({ pid, out });
}
