export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Introspect DateTimeFilter.period type
  const schema = await stQ(`{
    __schema { types {
      name
      inputFields { name type { name kind ofType { name kind ofType { name kind } } } }
      enumValues { name }
    }}
  }`);
  const types = schema?.data?.__schema?.types || [];
  for (const t of types) {
    if (t.name === 'DateTimeFilter' || t.name === 'DateTimePeriod' || 
        t.name?.includes('Period') || t.name === 'TimeRangeFilter') {
      out['type_' + t.name] = {
        inputs: t.inputFields?.map(f => `${f.name}:${f.type?.name||f.type?.ofType?.name||f.type?.kind}`),
        enums: t.enumValues?.map(e => e.name)
      };
    }
  }

  // Test period with a date string (Techno played vs Aurora on 2026-03-27)
  const r2 = await stQ(`{
    playerStatistics(playerId:"118726", filter:{startedAt:{period:"2026-03-27"}}) {
      aggregationSeriesIds
      series { count kills{sum avg} deaths{sum} ...on CsgoPlayerSeriesStatistics{headshots{sum}} }
    }
  }`);
  out.period_date = r2?.data || r2?.errors?.[0]?.message;

  // Test period with ISO datetime
  const r3 = await stQ(`{
    playerStatistics(playerId:"118726", filter:{startedAt:{period:"2026-03-27T00:00:00Z"}}) {
      aggregationSeriesIds
      series { count kills{sum} }
    }
  }`);
  out.period_datetime = r3?.data || r3?.errors?.[0]?.message;

  return res.json(out);
}
