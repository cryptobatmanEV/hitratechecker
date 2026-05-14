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

  // Test 1: correct field is "players" not "allPlayers"
  try {
    const d = await gridQuery(`{
      players(filter: { nickName: { startsWith: "NiKo" } }, first: 3) {
        edges { node { id nickName } }
      }
    }`);
    results.playerSearch = d;
  } catch(e) { results.playerSearch = { error: e.message }; }

  // Test 2: titles
  try {
    const d = await gridQuery(`{
      titles { edges { node { id name } } }
    }`);
    results.titles = d;
  } catch(e) { results.titles = { error: e.message }; }

  // Test 3: series with corrected fields
  try {
    const d = await gridQuery(`{
      allSeries(first: 2) {
        edges { node { id updatedAt type tournament { name } } }
      }
    }`);
    results.recentSeries = d;
  } catch(e) { results.recentSeries = { error: e.message }; }

  // Test 4: introspect Query type to see all available fields
  try {
    const d = await gridQuery(`{
      __type(name: "Query") {
        fields { name description }
      }
    }`);
    results.queryFields = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.queryFields = { error: e.message }; }

  return res.json({ results });
}
