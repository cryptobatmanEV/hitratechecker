export const config = { maxDuration: 30 };
const GRID_URL = 'https://api.grid.gg/central-data/graphql';
const KEY = process.env.GRID_API_KEY;
async function gridQuery(query, variables = {}) {
  const r = await fetch(GRID_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Find NiKo with correct field name
  try {
    const d = await gridQuery(`{
      players(filter: { nickname: { startsWith: "NiKo" } }, first: 3) {
        edges { node { id nickname } }
      }
    }`);
    results.playerSearch = d;
  } catch(e) { results.playerSearch = { error: e.message }; }

  // 2. Introspect Player type to see all available fields
  try {
    const d = await gridQuery(`{
      __type(name: "Player") {
        fields { name type { name kind ofType { name kind } } }
      }
    }`);
    results.playerType = d?.data?.__type?.fields?.map(f => ({
      name: f.name,
      type: f.type?.name || f.type?.ofType?.name || f.type?.kind
    }));
  } catch(e) { results.playerType = { error: e.message }; }

  // 3. Introspect Title to see fields (no edges wrapper)
  try {
    const d = await gridQuery(`{ titles { id name } }`);
    results.titles = d;
  } catch(e) { results.titles = { error: e.message }; }

  // 4. Try accessing series through player
  try {
    const d = await gridQuery(`{
      __type(name: "PlayerGameStatsConnection") {
        fields { name }
      }
    }`);
    results.playerGameStats = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.playerGameStats = { error: e.message }; }

  return res.json({ results });
}
