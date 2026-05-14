export const config = { maxDuration: 30 };

const GRID_URL = 'https://api.grid.gg/central-data/graphql';
const KEY = process.env.GRID_API_KEY;

async function gridQuery(query, variables = {}) {
  const r = await fetch(GRID_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // Test 1: Search for a known CS2 player (NiKo)
  try {
    const d = await gridQuery(`{
      allPlayers(filter: { nickName: { startsWith: "NiKo" } }, first: 3) {
        edges { node { id nickName teamMemberships { edges { node { team { name } } } } } }
      }
    }`);
    results.playerSearch = d;
  } catch(e) { results.playerSearch = { error: e.message }; }

  // Test 2: Try alternate player search format
  try {
    const d = await gridQuery(`{
      allPlayers(first: 3, filter: { nickName: { includesInsensitive: "s1mple" } }) {
        edges { node { id nickName } }
      }
    }`);
    results.playerSearch2 = d;
  } catch(e) { results.playerSearch2 = { error: e.message }; }

  // Test 3: Check what titles/games are available
  try {
    const d = await gridQuery(`{
      allTitles { edges { node { id name nameShortened } } }
    }`);
    results.titles = d;
  } catch(e) { results.titles = { error: e.message }; }

  // Test 4: Check series/matches available
  try {
    const d = await gridQuery(`{
      allSeries(first: 2, orderBy: STARTED_AT_DESC) {
        edges { node { id startedAt type tournament { name } teams { edges { node { name } } } } }
      }
    }`);
    results.recentSeries = d;
  } catch(e) { results.recentSeries = { error: e.message }; }

  return res.json({ key_set: !!KEY, results });
}
