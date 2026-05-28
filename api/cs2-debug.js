export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SP = `id name kills killAssistsGiven ... on SeriesPlayerStateCs2{headshots} ... on SeriesPlayerStateCsgo{headshots}`;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Exact replication of Pass 2 for Liquid on May 13
  const isoDate = '2026-05-13';
  const oppSearch = 'Liquid';
  const slug = 'swisher';

  // Step 1: find opponent team
  const oppQ = await cdQ(`{teams(filter:{name:{contains:"${oppSearch}"}},first:5){edges{node{id name}}}}`);
  out.step1_teams = oppQ?.data?.teams?.edges?.map(e=>e.node)||[];
  out.step1_error = oppQ?.errors;
  const oppIds = out.step1_teams.map(t=>t.id);

  // Step 2: find series ±1 day
  const gte = '2026-05-12T00:00:00Z';
  const lte = '2026-05-14T23:59:59Z';
  const srQ = await cdQ(`{allSeries(filter:{teamIds:{in:${JSON.stringify(oppIds)}},startTimeScheduled:{gte:"${gte}",lte:"${lte}"}},first:5,orderBy:StartTimeScheduled){edges{node{id startedAt tournament{name} teams{baseInfo{name}}}}}}`);
  out.step2_series = srQ?.data?.allSeries?.edges?.map(e=>e.node?.id+'|'+e.node?.startedAt?.split('T')[0]+'|'+e.node?.teams?.map(t=>t.baseInfo?.name).join(' vs '))||[];
  out.step2_error = srQ?.errors;
  const sid = srQ?.data?.allSeries?.edges?.[0]?.node?.id;

  // Step 3: Series State
  if(sid) {
    const ss = await ssQ(`{seriesState(id:"${sid}"){id startedAt teams{id name players{id name kills ...on SeriesPlayerStateCs2{headshots}}}}}`);
    out.step3_series_id = sid;
    out.step3_error = ss?.errors;
    const allPlayers = [];
    for(const team of ss?.data?.seriesState?.teams||[]) {
      for(const p of team.players||[]) {
        allPlayers.push({team:team.name, name:p.name, kills:p.kills, hs:p.headshots});
      }
    }
    out.step3_all_players = allPlayers;
    const swisher = allPlayers.find(p=>p.name?.toLowerCase().includes(slug));
    out.step3_swisher_found = !!swisher;
    out.step3_swisher = swisher;
  }

  return res.json(out);
}
