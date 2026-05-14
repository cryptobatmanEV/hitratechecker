export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function qStats(query) {
  await delay(1500);
  const r = await fetch(STATS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

async function qCD(query) {
  await delay(1500);
  const r = await fetch(CD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Check GameStatisticsBySeries - found from seriesStatsType
  try {
    const d = await qStats(`{ __type(name: "GameStatisticsBySeries") { fields { name } } }`);
    const fields = d?.data?.__type?.fields?.map(f => f.name) || [];
    results.GameStatisticsBySeries = { hasHeadshots: fields.includes('headshots'), fields };
  } catch(e) { results.GameStatisticsBySeries = { error: e.message }; }

  // 2. Check SeriesStatisticsBySeries
  try {
    const d = await qStats(`{ __type(name: "SeriesStatisticsBySeries") { fields { name } } }`);
    const fields = d?.data?.__type?.fields?.map(f => f.name) || [];
    results.SeriesStatisticsBySeries = { hasHeadshots: fields.includes('headshots'), fields };
  } catch(e) { results.SeriesStatisticsBySeries = { error: e.message }; }

  // 3. Check segment types
  try {
    const d = await qStats(`{ __type(name: "PlayerSegmentStatistics") { fields { name } } }`);
    const fields = d?.data?.__type?.fields?.map(f => f.name) || [];
    results.PlayerSegmentStatistics = { hasHeadshots: fields.includes('headshots'), fields };
  } catch(e) { results.PlayerSegmentStatistics = { error: e.message }; }

  // 4. Get all schema types and filter for anything with headshots
  try {
    const d = await qStats(`{ __schema { types { name kind } } }`);
    results.allStatTypes = d?.data?.__schema?.types
      ?.map(t => t.name)
      .filter(n => !n.startsWith('__'));
  } catch(e) { results.allStatTypes = { error: e.message }; }

  // 5. Find Team Falcons in GRID to get their team ID
  try {
    const d = await qCD(`{
      teams(filter: { name: { contains: "Falcons" }, titleId: "28" }) {
        edges { node { id name } }
      }
    }`);
    results.teamFalcons = d;
  } catch(e) { results.teamFalcons = { error: e.message }; }

  return res.json({ results });
}
