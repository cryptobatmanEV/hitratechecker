export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Does GRID have BC Game Masters in Central Data?
  const r1 = await cdQ(`{ tournaments(filter:{name:{contains:"BC Game"}},first:5){ edges{node{id name startDate}} } }`);
  out.bcgame_tournaments = r1?.data?.tournaments?.edges?.map(e=>e.node) || [];

  // 2. Does GRID have WINLINE events?
  const r2 = await cdQ(`{ tournaments(filter:{name:{contains:"WINLINE"}},first:5){ edges{node{id name startDate}} } }`);
  out.winline_tournaments = r2?.data?.tournaments?.edges?.map(e=>e.node) || [];

  // 3. Does GRID have CCT events (we know they do)?
  const r3 = await cdQ(`{ tournaments(filter:{name:{contains:"CCT"}},first:3){ edges{node{id name startDate}} } }`);
  out.cct_tournaments = r3?.data?.tournaments?.edges?.map(e=>e.node) || [];

  // 4. allSeries for Cybershoke 52247 — show ALL recent series with tournaments
  // to see which ones glowiing might be in
  const sixMonthsAgo = new Date(Date.now()-180*86400000).toISOString();
  const r4 = await cdQ(`{
    allSeries(filter:{teamIds:{in:["52247"]}, startTimeScheduled:{gte:"${sixMonthsAgo}"}}, first:50, orderBy:StartTimeScheduled) {
      edges{node{id startTimeScheduled tournament{name}}}
    }
  }`);
  const all = r4?.data?.allSeries?.edges?.map(e=>e.node)||[];
  out.allCybershokeSeries = all.map(s=>({
    date: s.startTimeScheduled?.split('T')[0],
    tournament: s.tournament?.name,
    id: s.id
  }));

  // 5. Try latestSeriesStateByPlayerId with GRID player ID (not Steam)
  const r5 = await ssQ(`{ latestSeriesStateByPlayerId(id:"116103") {
    id startedAt
    teams { name players { id name kills } }
  }}`);
  out.latestByGridId = r5?.data?.latestSeriesStateByPlayerId || r5?.errors?.[0]?.message;

  return res.json(out);
}
