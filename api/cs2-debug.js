export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Introspect SeriesStatisticsFilter and GameStatisticsFilter fields
  const schema = await stQ(`{
    __schema { types {
      name
      inputFields { name type { name kind ofType { name kind } } }
    }}
  }`);
  const types = schema?.data?.__schema?.types || [];
  for (const t of types) {
    if (['SeriesStatisticsFilter','GameStatisticsFilter','GameSelection'].includes(t.name)) {
      out[t.name] = t.inputFields?.map(f => ({
        name: f.name,
        type: f.type?.name || f.type?.ofType?.name || f.type?.kind
      }));
    }
  }

  // 2. Test seriesStatistics with playerId filter (NiKo CS:GO ID 7190)
  const r2 = await stQ(`{
    seriesStatistics(titleId:"1", filter:{playerId:"7190"}) {
      __typename
    }
  }`);
  out.seriesStats_byPlayer = r2?.data || r2?.errors?.[0]?.message;

  // 3. Test seriesStatistics with seriesId filter
  const r3 = await stQ(`{
    seriesStatistics(titleId:"1", filter:{seriesId:"2931340"}) {
      __typename
    }
  }`);
  out.seriesStats_bySeriesId = r3?.data || r3?.errors?.[0]?.message;

  return res.json(out);
}
