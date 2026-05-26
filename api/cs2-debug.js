export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. latestSeriesStateByPlayerId — what is glowiing's most recent GRID series?
  const r1 = await ssQ(`{
    latestSeriesStateByPlayerId(playerId:"116103") {
      id startedAt finished
      teams {
        id name
        players {
          id name kills deaths
          ... on SeriesPlayerStateCs2 { headshots }
        }
      }
    }
  }`);
  out.latestSeries = r1?.data?.latestSeriesStateByPlayerId || r1?.errors?.[0]?.message;

  // 2. What does glowiing's GRID profile say NOW (current team)?
  const r2 = await cdQ(`{
    player(id:"116103") {
      id nickname
      team { id name }
    }
  }`);
  out.glowiingProfile = r2?.data?.player || r2?.errors;

  // 3. Search allSeries for the team in glowiing's profile
  const currentTeamId = r2?.data?.player?.team?.id;
  out.currentTeamId = currentTeamId;
  if (currentTeamId) {
    const sixMonthsAgo = new Date(Date.now()-180*86400000).toISOString();
    const r3 = await cdQ(`{
      allSeries(filter:{teamIds:{in:["${currentTeamId}"]}, startTimeScheduled:{gte:"${sixMonthsAgo}"}}, first:50, orderBy:StartTimeScheduled) {
        edges{node{id startTimeScheduled tournament{name}}}
      }
    }`);
    const series = r3?.data?.allSeries?.edges?.map(e=>e.node)||[];
    out.currentTeamSeriesCount = series.length;
    out.currentTeamMostRecent3 = series.slice(-3).reverse();
  }

  return res.json(out);
}
