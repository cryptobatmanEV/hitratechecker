export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Test 1: teamGameStatistics for The MongolZ (teamId: 51967 from our earlier debug)
  // This returns per-GAME (per-map) stats with player breakdowns
  const r1 = await stQ(`{
    teamGameStatistics(teamId:"51967", selection:{
      filter:{ timeWindow:LAST_MONTH }
      first:3
    }) {
      count
      won { value count }
      kills { sum avg }
      ... on TeamGameStatisticsCs2 {
        players {
          characters {
            characterId
            kills { sum avg }
            deaths { sum avg }
            headshots { sum avg }
          }
        }
      }
    }
  }`);
  out.teamGameStats = r1?.data || r1?.errors;

  // Test 2: seriesStatistics games field for a tournament - does it break down per-player?
  const r2 = await stQ(`{
    seriesStatistics(titleId:"28", filter:{tournament:{id:"829250"}}) {
      aggregationSeriesIds
      count
      games {
        map { name }
        teams {
          kills { sum }
          ... on TeamGameStatisticsCs2 {
            players {
              characters {
                characterId
                kills { sum }
                deaths { sum }
              }
            }
          }
        }
      }
    }
  }`);
  out.seriesStatsGames = r2?.data || r2?.errors;

  return res.json(out);
}
