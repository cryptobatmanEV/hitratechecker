export const config = { maxDuration: 30 };
const GRID_URL = 'https://api.grid.gg/central-data/graphql';
const KEY = process.env.GRID_API_KEY;
async function gridQuery(query) {
  const r = await fetch(GRID_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. What operators does StringFilter support?
  try {
    const d = await gridQuery(`{
      __type(name: "StringFilter") { inputFields { name } }
    }`);
    results.stringFilterOps = d?.data?.__type?.inputFields?.map(f => f.name);
  } catch(e) { results.stringFilterOps = { error: e.message }; }

  // 2. What fields does Tournament have?
  try {
    const d = await gridQuery(`{
      __type(name: "Tournament") { fields { name type { name kind ofType { name } } } }
    }`);
    results.tournamentType = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.tournamentType = { error: e.message }; }

  // 3. What fields does Series have?
  try {
    const d = await gridQuery(`{
      __type(name: "Series") { fields { name type { name kind ofType { name } } } }
    }`);
    results.seriesType = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.seriesType = { error: e.message }; }

  // 4. What fields does Game have? (maps in CS2)
  try {
    const d = await gridQuery(`{
      __type(name: "Game") { fields { name type { name kind ofType { name } } } }
    }`);
    results.gameType = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.gameType = { error: e.message }; }

  // 5. Try a player search with different filter
  try {
    const d = await gridQuery(`{
      players(filter: { nickname: { equalTo: "NiKo" } }, first: 1) {
        edges { node { id nickname team { name } title { name } } }
      }
    }`);
    results.playerNiKo = d;
  } catch(e) { results.playerNiKo = { error: e.message }; }

  return res.json({ results });
}
