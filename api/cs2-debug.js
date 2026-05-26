export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Try latestSeriesStateByPlayerId with Steam ID
  const r1 = await ssQ(`{ latestSeriesStateByPlayerId(id:"76561198174263909") {
    id startedAt
    teams { id name players { id name kills ... on SeriesPlayerStateCs2 { headshots } } }
  }}`);
  out.latestBySteamId = r1?.data?.latestSeriesStateByPlayerId || r1?.errors?.[0]?.message;

  // 2. Look up glowiing's teammates (Mokuj1n, fluffy, bl1x1) in GRID to find real team
  const teammates = ['Mokuj1n', 'fluffy', 'bl1x1', 'alpha'];
  const teamLookups = await Promise.all(teammates.map(nick =>
    cdQ(`{ players(filter:{nickname:{equals:"${nick}"}},first:5){
      edges{node{id nickname title{id} team{id name}}}
    }}`)
  ));
  out.teammates = teammates.map((nick, i) => {
    const profiles = teamLookups[i]?.data?.players?.edges?.map(e=>e.node)||[];
    const cs2 = profiles.find(p=>p.title?.id==='28') || profiles[0];
    return { nick, gridId: cs2?.id, teamId: cs2?.team?.id, teamName: cs2?.team?.name };
  });

  // 3. If teammates share a team, get recent series for that team
  const realTeamId = out.teammates.find(t => t.teamId)?.teamId;
  out.realTeamId = realTeamId;
  if (realTeamId && realTeamId !== '52247') {
    const sixMonthsAgo = new Date(Date.now()-180*86400000).toISOString();
    const r3 = await cdQ(`{
      allSeries(filter:{teamIds:{in:["${realTeamId}"]}, startTimeScheduled:{gte:"${sixMonthsAgo}"}}, first:50, orderBy:StartTimeScheduled) {
        edges{node{id startTimeScheduled tournament{name}}}
      }
    }`);
    const s = r3?.data?.allSeries?.edges?.map(e=>e.node)||[];
    out.realTeamSeriesCount = s.length;
    out.realTeamRecent3 = s.slice(-3).reverse();
  }

  return res.json(out);
}
