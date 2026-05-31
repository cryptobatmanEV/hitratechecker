export const config = { maxDuration: 30 };

// CORRECT GRID endpoints and auth (from cs2.js)
const CD = 'https://api-op.grid.gg/central-data/graphql';

async function cdQ(q) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error:'no key' };
  const r = await fetch(CD, { method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key},
    body: JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = { note:'Using api-op.grid.gg + x-api-key (correct endpoints from cs2.js)' };

  // Test: search for a known CS2 pro
  out.player_search = await cdQ(`{players(filter:{nickname:{equals:"stadodo"}},first:5){edges{node{id nickname title{id} team{id name}}}}}`);

  // Test: get recent series if player found
  const p = out.player_search?.data?.players?.edges?.[0]?.node;
  out.found_player = p ? { id:p.id, nick:p.nickname, title:p.title?.id, team:p.team?.name, teamId:p.team?.id } : null;

  if (p?.team?.id) {
    const ago = new Date(Date.now()-180*86400000).toISOString();
    out.series_lookup = await cdQ(`{allSeries(filter:{teamIds:{in:["${p.team.id}"]},startTimeScheduled:{gte:"${ago}"}},first:5,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
    out.series_ids = out.series_lookup?.data?.allSeries?.edges?.map(e=>e.node.id);
  }

  return res.json(out);
}
