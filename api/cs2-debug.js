export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Get exact arguments for seriesStatistics, gameStatistics, teamGameStatistics
  const schema = await stQ(`{
    __schema { queryType { fields {
      name
      args { name type { name kind ofType { name kind ofType { name kind } } } }
    }}}
  }`);
  const fields = schema?.data?.__schema?.queryType?.fields || [];
  out.queryArgs = {};
  for (const f of fields) {
    if (['seriesStatistics','gameStatistics','teamGameStatistics','playerStatistics'].includes(f.name)) {
      out.queryArgs[f.name] = f.args.map(a => ({
        name: a.name,
        type: a.type?.name || a.type?.ofType?.name || a.type?.kind
      }));
    }
  }

  // 2. Test seriesStatistics with titleId + known series ID (NiKo IEM Rio series)
  const r2 = await stQ(`{ seriesStatistics(titleId:"28", seriesId:"2931340") { __typename } }`);
  out.seriesStats_test1 = r2?.data || r2?.errors?.[0]?.message;

  // 3. Try gameStatistics - need to find what a "game" ID is
  // First get games from a known series in CD
  const r3 = await cdQ(`{ series(id:"2931340") { id games { id sequenceNumber } } }`);
  out.seriesGames = r3?.data || r3?.errors?.[0]?.message;

  return res.json(out);
}
