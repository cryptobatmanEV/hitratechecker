export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Get The MongolZ actual team ID from Techno's CS2 profile
  const r1 = await cdQ(`{ players(filter:{nickname:{equals:"Techno"}},first:5){ edges{ node{ id nickname title{id} team{id name} } } } }`);
  out.techno_profiles = r1?.data?.players?.edges?.map(e=>e.node);

  // 2. What tournaments does GRID have for 2026? (BLAST, ESL, IEM)
  const r2 = await cdQ(`{ tournaments(filter:{name:{contains:"BLAST"}},first:5){ edges{ node{id name startDate} } } }`);
  out.blast_tournaments = r2?.data?.tournaments?.edges?.map(e=>e.node) || r2?.errors;

  const r3 = await cdQ(`{ tournaments(filter:{name:{contains:"IEM"}},first:5){ edges{ node{id name startDate} } } }`);
  out.iem_tournaments = r3?.data?.tournaments?.edges?.map(e=>e.node) || r3?.errors;

  // 3. What's in Techno's aggregationSeriesIds - get LAST_YEAR to see what tournaments they're from
  const r4 = await stQ(`{ playerStatistics(playerId:"118726",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds series{count kills{sum}} } }`);
  const ids = r4?.data?.playerStatistics?.aggregationSeriesIds || [];
  out.techno_last_year = { count: r4?.data?.playerStatistics?.series?.count, totalIds: ids.length, firstId: ids[0], lastId: ids[ids.length-1] };

  // 4. Get metadata for most recent series ID to see what tournament it's from
  if (ids.length) {
    const r5 = await cdQ(`{ series(id:"${ids[0]}") { id startTimeScheduled tournament{id name} teams{baseInfo{id name}} } }`);
    out.most_recent_series = r5?.data?.series || r5?.errors;
  }

  return res.json(out);
}
