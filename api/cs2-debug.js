export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Deep introspect ALL types to find per-series/game player stat structures
  const schema = await stQ(`{
    __schema { types {
      name
      inputFields { name type { name kind ofType { name kind } } }
      fields { 
        name 
        type { name kind ofType { name kind ofType { name kind } } }
      }
    }}
  }`);
  const types = schema?.data?.__schema?.types || [];
  
  // Find types that are relevant to series/game stats
  const relevant = [
    'SeriesStatistics','GameStatistics',
    'CsgoSeriesStatistics','CsgoGameStatistics',
    'CsgoSeriesPlayerStatistics','CsgoGamePlayerStatistics',
    'SeriesStatisticsEntry','GameStatisticsEntry',
    'PlayerSeriesStatisticsEntry','PlayerGameStatisticsEntry',
    'DateTimePeriodFilter','DateTimePeriod',
    'SeriesPlayerStatistics','GamePlayerStatistics'
  ];
  
  for (const t of types) {
    if (relevant.includes(t.name) || 
        t.name?.toLowerCase().includes('series') || 
        t.name?.toLowerCase().includes('game') ||
        t.name?.toLowerCase().includes('player')) {
      if (t.fields?.length || t.inputFields?.length) {
        out[t.name] = {
          fields: t.fields?.map(f => `${f.name}:${f.type?.name||f.type?.ofType?.name||f.type?.ofType?.ofType?.name||f.type?.kind}`),
          inputs: t.inputFields?.map(f => f.name)
        };
      }
    }
  }

  return res.json(out);
}
