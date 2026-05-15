export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. ALL available queries in Stats Feed
  const schema = await stQ(`{ __schema { queryType { fields { name description } } } }`);
  out.statsQueries = schema?.data?.__schema?.queryType?.fields?.map(f=>f.name) || schema?.errors;

  // 2. ALL available queries in Central Data
  const cdSchema = await cdQ(`{ __schema { queryType { fields { name description } } } }`);
  out.cdQueries = cdSchema?.data?.__schema?.queryType?.fields?.map(f=>f.name) || cdSchema?.errors;

  // 3. Try querying series stats directly from Stats Feed with a known series ID
  const r3 = await stQ(`{ seriesStatistics(seriesId:"2931340") { kills{sum} deaths{sum} } }`);
  out.seriesStatistics = r3?.data || r3?.errors?.[0]?.message;

  // 4. Try series player stats from Stats Feed
  const r4 = await stQ(`{ seriesPlayerStatistics(seriesId:"2931340") { kills{sum} deaths{sum} } }`);
  out.seriesPlayerStatistics = r4?.data || r4?.errors?.[0]?.message;

  // 5. Try getting stats FROM the series object in Central Data
  const r5 = await cdQ(`{ series(id:"2931340") { id playerStatistics { playerId stats { kills deaths } } } }`);
  out.seriesPlayerStatsFromCD = r5?.data || r5?.errors?.[0]?.message;

  return res.json(out);
}
