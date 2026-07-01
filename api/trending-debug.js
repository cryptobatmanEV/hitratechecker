export const config = { maxDuration: 25 };
const UA = 'Mozilla/5.0';
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';

async function cdQ(q) {
  const key = process.env.GRID_API_KEY;
  const r = await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({query:q}),signal:AbortSignal.timeout(8000)});
  return r.json();
}
async function ssQ(q) {
  const key = process.env.GRID_API_KEY;
  const r = await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({query:q}),signal:AbortSignal.timeout(8000)});
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: Get a CS2 player name from PP
  const pp = await fetch('https://partner-api.prizepicks.com/projections?league_id=265&per_page=10',
    {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'},signal:AbortSignal.timeout(8000)});
  const ppd = await pp.json();
  const pMap = {};
  for (const i of ppd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name};
  const proj = (ppd.data||[]).find(p=>p.type==='projection');
  const testName = pMap[proj?.relationships?.new_player?.data?.id]?.name;
  const testStat = proj?.attributes?.stat_type;
  out.pp = {status:pp.status, count:ppd.data?.length, testName, testStat};

  if (!testName) return res.json(out);

  // Step 2: Search GRID for this player
  const safe = testName.replace(/"/g,'');
  const gSearch = await cdQ(`{players(filter:{nickname:{contains:"${safe}"}},first:5){edges{node{id nickname title{id} team{id name}}}}}`);
  const allNodes = gSearch?.data?.players?.edges?.map(e=>e.node)||[];
  const cs2player = allNodes.find(p=>p.title?.id==='28')||allNodes.find(p=>p.title?.id==='1')||allNodes[0];
  out.grid_search = {error:gSearch?.errors?.[0]?.message, total_found:allNodes.length, cs2_player:cs2player?{id:cs2player.id,nick:cs2player.nickname,title:cs2player.title?.id,team:cs2player.team?.name}:null};

  if (!cs2player?.team?.id) return res.json(out);

  // Step 3: Get recent series for this team
  const ago = new Date(Date.now()-90*86400000).toISOString();
  const gSeries = await cdQ(`{allSeries(filter:{teamIds:{in:["${cs2player.team.id}"]},startTimeScheduled:{gte:"${ago}"}},first:5,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
  const seriesIds = (gSeries?.data?.allSeries?.edges||[]).map(e=>e.node?.id).filter(Boolean);
  out.grid_series = {error:gSeries?.errors?.[0]?.message, count:seriesIds.length, ids:seriesIds.slice(0,3)};

  if (!seriesIds.length) return res.json(out);

  // Step 4: Get kills from series state
  const sid = seriesIds[0];
  const slug = cs2player.nickname.toLowerCase();
  const gState = await ssQ(`{seriesState(id:"${sid}"){id startedAt teams{id name players{id name kills}} games{sequenceNumber teams{id players{id name kills}}}}}`);
  const ss = gState?.data?.seriesState;
  const myTeam = ss?.teams?.find(t=>t.players?.some(p=>p.name?.toLowerCase().includes(slug)));
  const myPlayer = myTeam?.players?.find(p=>p.name?.toLowerCase().includes(slug));
  const mapKills = (ss?.games||[]).map(g=>{
    const gt = g.teams?.find(t=>t.id===myTeam?.id);
    return gt?.players?.find(p=>p.name?.toLowerCase().includes(slug))?.kills??null;
  });
  out.grid_state = {error:gState?.errors?.[0]?.message, series_kills:myPlayer?.kills, map_kills:mapKills, maps_count:ss?.games?.length};

  return res.json(out);
}
