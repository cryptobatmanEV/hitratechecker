export const config = { maxDuration: 30 };
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gp(q) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error:'no key' };
  const r = await fetch(GRID_URL, { method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ query:q }) });
  const j = await r.json();
  return { status:r.status, data:j?.data, errors:j?.errors?.map(e=>e.message) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Introspect TeamParticipant — does it have kill stats?
  out.TeamParticipant = (await gp(
    `query { __type(name:"TeamParticipant") { fields { name type { name kind ofType { name } } } } }`
  )).data?.__type?.fields?.map(f => `${f.name}: ${f.type?.name||f.type?.ofType?.name||f.type?.kind}`);

  // Introspect common stat types
  for (const t of ['PlayerGameData','PlayerMatchData','PlayerStats','SeriesPlayer','GamePlayer','PlayerGame','MatchPlayer']) {
    const r = await gp(`query { __type(name:"${t}") { fields { name } } }`);
    if (r.data?.__type) out[`type_${t}`] = r.data.__type.fields?.map(f=>f.name);
  }

  // Try: Series.teams.nodes with player stats
  out.teams_nodes_test = await gp(`
    query { allSeries(first:3) { edges { node {
      id type
      teams { nodes { name score players { nickname } } }
    } } } }`);

  // Try: does allSeries have a 'games' sub-query at game level (not Series.games)?
  out.schema_query_types = (await gp(
    `query { __schema { queryType { fields { name } } } }`
  )).data?.__schema?.queryType?.fields?.map(f=>f.name);

  return res.json(out);
}
