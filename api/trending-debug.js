export const config = { maxDuration: 30 };
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';

async function cdQ(q) {
  const key = process.env.GRID_API_KEY;
  const r = await fetch(CD, { method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key},
    body: JSON.stringify({query:q}) });
  return r.json();
}
async function ssQ(q) {
  const key = process.env.GRID_API_KEY;
  const r = await fetch(SS, { method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key},
    body: JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Test player search for actual PP CS2 players
  const testPlayers = ['Brooxsy','Chucky','Djoko','bL4SEZ','stadodo'];
  out.player_searches = {};

  for (const name of testPlayers) {
    try {
      const d = await cdQ(`{players(filter:{nickname:{contains:"${name}"}},first:5){edges{node{id nickname title{id} team{id name}}}}}`);
      const nodes = (d?.data?.players?.edges||[]).map(e=>e.node);
      out.player_searches[name] = {
        found: nodes.length,
        players: nodes.map(n=>({ id:n.id, nick:n.nickname, title:n.title?.id, team:n.team?.name }))
      };
    } catch(e) {
      out.player_searches[name] = { error: e.message };
    }
  }

  return res.json(out);
}
