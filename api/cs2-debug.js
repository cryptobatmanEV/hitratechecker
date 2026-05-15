export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Get exact RETURN TYPE of teamGameStatistics
  const schema = await stQ(`{
    __schema { queryType { fields {
      name
      type { name kind ofType { name kind ofType { name kind } } }
    }}}
  }`);
  const fields = schema?.data?.__schema?.queryType?.fields || [];
  out.returnTypes = {};
  for (const f of fields) {
    if (['teamGameStatistics','gameStatistics','seriesStatistics','playerStatistics'].includes(f.name)) {
      out.returnTypes[f.name] = f.type?.name || f.type?.kind + '<' + (f.type?.ofType?.name || f.type?.ofType?.kind) + '>';
    }
  }

  // 2. Test teamGameStatistics with JUST basic fields (no characters)
  // Does it return per-game data or aggregate?
  const r2 = await stQ(`{
    teamGameStatistics(teamId:"51967", selection:{
      filter:{ timeWindow:LAST_MONTH }
      first:10
    }) {
      __typename
      count
      won { value count }
      kills { sum avg min max }
      deaths { sum avg }
    }
  }`);
  out.teamGameStats_basic = r2?.data || r2?.errors;

  // 3. Introspect CharacterOccurrenceStatistic fully
  const types = schema?.data?.__schema?.types || [];

  return res.json(out);
}
