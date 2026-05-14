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

  // 1. Find NiKo using correct filter
  try {
    const d = await gridQuery(`{
      players(filter: { nickname: { equals: "NiKo" } }, first: 1) {
        edges { node { id nickname team { name } title { name } } }
      }
    }`);
    results.nikoPlayer = d;
  } catch(e) { results.nikoPlayer = { error: e.message }; }

  // 2. What type is SeriesPlayer/PlayerParticipant?
  try {
    const d = await gridQuery(`{
      __type(name: "SeriesPlayer") { fields { name type { name kind ofType { name } } } }
    }`);
    results.seriesPlayerType = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.seriesPlayerType = { error: e.message }; }

  // 3. Try PlayerParticipant type name
  try {
    const d = await gridQuery(`{
      __type(name: "PlayerParticipant") { fields { name } }
    }`);
    results.playerParticipantType = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.playerParticipantType = { error: e.message }; }

  // 4. Check all types in schema that contain "Player" or "Stat"
  try {
    const d = await gridQuery(`{
      __schema {
        types { name kind }
      }
    }`);
    const types = d?.data?.__schema?.types?.map(t => t.name) || [];
    results.relevantTypes = types.filter(t => 
      t.includes('Player') || t.includes('Stat') || t.includes('Game') || t.includes('Kill') || t.includes('Map')
    );
  } catch(e) { results.relevantTypes = { error: e.message }; }

  return res.json({ results });
}
