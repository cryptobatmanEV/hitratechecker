export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';

async function q(query) {
  const r = await fetch(SS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query })
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Get all query types
  const schema = await q(`{
    __schema {
      queryType { fields { name args { name type { name kind ofType { name kind } } } } }
      types { name fields { name type { name kind ofType { name kind ofType { name } } } } }
    }
  }`);
  
  const types = schema?.data?.__schema?.types || [];
  const queries = schema?.data?.__schema?.queryType?.fields || [];
  
  out.queries = queries.map(f => ({
    name: f.name,
    args: f.args?.map(a => `${a.name}:${a.type?.name || a.type?.ofType?.name || a.type?.kind}`)
  }));

  // Key types - look for series, player, kills, headshots
  const keyTypes = types.filter(t => 
    t.name && !t.name.startsWith('__') && 
    (t.name.toLowerCase().includes('series') || 
     t.name.toLowerCase().includes('player') ||
     t.name.toLowerCase().includes('stat') ||
     t.name.toLowerCase().includes('kill') ||
     t.name.toLowerCase().includes('map'))
  );
  out.keyTypes = keyTypes.map(t => ({
    name: t.name,
    fields: t.fields?.map(f => f.name)
  }));

  // 2. Try querying a known Techno series (from our earlier debug: 2913007)
  const r2 = await q(`{
    seriesState(id: "2913007") {
      id
      started
      finished
      teams { id name players { id nickname kills deaths assists headshots } }
      games { id map { name } teams { id players { id nickname kills deaths assists headshots } } }
    }
  }`);
  out.seriesState_sample = r2?.data || r2?.errors?.[0]?.message || r2?.errors;

  return res.json(out);
}
