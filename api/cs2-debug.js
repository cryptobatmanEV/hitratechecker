export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Explore segment + game fields we've NEVER queried
  const r1 = await stQ(`{
    playerStatistics(playerId:"118726", filter:{timeWindow:LAST_MONTH}) {
      aggregationSeriesIds
      series { count kills{sum avg min max} }
      game { count kills{sum avg min max} deaths{sum avg} }
      segment {
        ...on PlayerSegmentStatistics { type count kills{sum avg} deaths{sum avg} }
        ...on PlayerSegmentStatisticsCs2 { type count kills{sum avg} deaths{sum avg} }
        ...on PlayerSegmentStatisticsCsgo { type count kills{sum avg} deaths{sum avg} }
      }
    }
  }`);
  out.stats_with_game_and_segment = r1?.data || r1?.errors;

  // 2. Check allSeries in CD — can we get recent MongolZ series with stats?
  const r2 = await cdQ(`{
    allSeries(filter:{teamIds:{in:["51967"]}}, first:5, orderBy:{field:StartTime,order:DESC}) {
      edges { node { 
        id startTimeScheduled 
        tournament { id name }
        teams { baseInfo { id name } }
      }}
    }
  }`);
  out.allSeries_recent = r2?.data || r2?.errors;

  // 3. Check if PGL Astana 2026 tournament exists in GRID
  const r3 = await cdQ(`{
    tournaments(filter:{name:{contains:"Astana"}}, first:5) {
      edges { node { id name startDate } }
    }
  }`);
  out.pgl_astana_search = r3?.data || r3?.errors;

  return res.json(out);
}
