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

  // Check all CS2-specific stat types for headshots
  const cs2Types = [
    'Cs2PlayerSeriesStatistics',
    'PlayerGameStatisticsCs2',
    'PlayerSegmentStatisticsCs2',
    'Cs2TeamSeriesStatistics',
    'TeamGameStatisticsCs2',
    'TeamSegmentStatisticsCs2',
    'GameTeamsStatisticsByGameCs2',
    'GameStatisticsByGame',
    'TeamPlayersStatisticsByGame',
  ];

  for (const type of cs2Types) {
    try {
      const d = await qStats(`{ __type(name: "${type}") { fields { name } } }`);
      const fields = d?.data?.__type?.fields?.map(f => f.name) || [];
      results[type] = {
        hasHeadshots: fields.includes('headshots'),
        fields,
      };
    } catch(e) { results[type] = { error: e.message }; }
  }

  // Get Team Falcons recent CS2 series IDs
  try {
    const d = await qCD(`{
      allSeries(
        first: 5
        orderBy: StartTimeScheduled
        orderDirection: DESC
        filter: { teamIds: { in: ["51967"] } titleIds: { in: ["28"] } }
      ) {
        edges { node { id startTimeScheduled tournament { name } teams { baseInfo { name } } } }
      }
    }`);
    results.falconsSeries = d;
  } catch(e) { results.falconsSeries = { error: e.message }; }

  return res.json({ results });
}
