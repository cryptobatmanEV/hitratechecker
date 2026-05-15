export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. NiKo LAST_MONTH - does he have recent stats? (confirms if issue is Techno or GRID broadly)
  const r1 = await stQ(`{ playerStatistics(playerId:"7190",filter:{timeWindow:LAST_MONTH}){ aggregationSeriesIds series{count kills{sum}} } }`);
  out.niko_last_month = { count: r1?.data?.playerStatistics?.series?.count, ids: r1?.data?.playerStatistics?.aggregationSeriesIds?.length, error: r1?.errors?.[0]?.message };

  // 2. Get SeriesOrderBy enum values
  const schema = await stQ(`{ __schema { types { name enumValues { name } } } }`);
  const types = schema?.data?.__schema?.types || [];
  const sob = types.find(t => t.name === 'SeriesOrderBy');
  const cdSchema = await cdQ(`{ __schema { types { name enumValues { name } } } }`);
  const cdTypes = cdSchema?.data?.__schema?.types || [];
  const cdSob = cdTypes.find(t => t.name === 'SeriesOrder' || t.name === 'SeriesOrderBy');
  out.SeriesOrderBy_stats = sob?.enumValues?.map(e=>e.name);
  out.SeriesOrder_cd = cdSob?.enumValues?.map(e=>e.name);

  // 3. Check if PGL Bucharest 2026 exists in GRID CD
  const r3 = await cdQ(`{ tournaments(filter:{name:{contains:"PGL"}},first:10){ edges{ node{id name startDate} } } }`);
  out.pgl_tournaments = r3?.data?.tournaments?.edges?.map(e=>e.node) || r3?.errors;

  // 4. allSeries for MongolZ without orderBy to see what we get
  const r4 = await cdQ(`{ allSeries(filter:{teamIds:{in:["51967"]}},first:5){ edges{ node{id startTimeScheduled tournament{id name} teams{baseInfo{name}}} } } }`);
  out.allSeries_mongolz = r4?.data || r4?.errors;

  return res.json(out);
}
