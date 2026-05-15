export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Introspect tournament filter types + return types
  const schema = await stQ(`{
    __schema { types {
      name
      inputFields { name type { name kind ofType { name kind } } }
      fields { name type { name kind ofType { name kind ofType { name kind } } } }
    }}
  }`);
  const types = schema?.data?.__schema?.types || [];
  for (const t of types) {
    if ([
      'SeriesStatisticsTournamentFilter',
      'GameStatisticsTournamentFilter',
      'SeriesStatistics',
      'GameStatistics',
      'CsgoSeriesStatistics',
      'CsgoGameStatistics',
      'DateTimeFilter'
    ].includes(t.name)) {
      out[t.name] = {
        inputFields: t.inputFields?.map(f => f.name),
        fields: t.fields?.map(f => f.name)
      };
    }
  }

  // 2. Test seriesStatistics with tournament filter (IEM Rio 2026 Playoffs = 829250)
  const r2 = await stQ(`{
    seriesStatistics(titleId:"1", filter:{tournament:{id:"829250"}}) {
      __typename
    }
  }`);
  out.seriesStats_tournament = r2?.data || r2?.errors?.[0]?.message;

  // 3. Test gameStatistics with tournament filter
  const r3 = await stQ(`{
    gameStatistics(titleId:"1", filter:{tournament:{id:"829250"}}) {
      __typename
    }
  }`);
  out.gameStats_tournament = r3?.data || r3?.errors?.[0]?.message;

  return res.json(out);
}
