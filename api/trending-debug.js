export const config = { maxDuration: 30 };
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gp(q, v={}) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error:'no GRID_API_KEY' };
  const r = await fetch(GRID_URL, { method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ query:q, variables:v }) });
  const t = await r.text();
  let j; try{j=JSON.parse(t);}catch{j={raw:t.slice(0,200)};}
  return { status:r.status, data:j?.data, errors:j?.errors?.map(e=>e.message) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Test: allSeries → edges.node → players.nodes (correct GRID schema)
  out.test_final = await gp(`
    query { allSeries(first:5) { edges { node {
      id type startTimeScheduled
      players { nodes { nickname kills } }
    } } } }`);

  // Extract results
  const nodes = (out.test_final.data?.allSeries?.edges||[]).map(e=>e.node).filter(Boolean);
  out.series_count = nodes.length;
  out.esports_count = nodes.filter(n=>n.type==='ESPORTS').length;
  out.sample = nodes.slice(0,3).map(s=>({
    id: s.id, type: s.type, date: s.startTimeScheduled,
    player_count: s.players?.nodes?.length,
    players: (s.players?.nodes||[]).slice(0,4).map(p=>({ nick:p.nickname, kills:p.kills })),
  }));

  return res.json(out);
}
