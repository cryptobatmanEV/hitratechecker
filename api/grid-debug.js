export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';

async function q(query) {
  await new Promise(r => setTimeout(r, 1500)); // avoid rate limit
  const r = await fetch(STATS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // Check every stat type for headshots field
  const typesToCheck = [
    'TeamSeriesStatistics', 'TeamGameStatistics', 'TeamSegmentStatistics',
    'PlayerSegmentStatistics', 'SeriesStatisticsResult', 'GameStatisticsResult',
    'PlayerStatistics', 'SeriesStatistics', 'GameStatistics',
    'SeriesStatisticsGames', 'SeriesStatisticsSeries',
  ];

  for (const type of typesToCheck) {
    try {
      const d = await q(`{ __type(name: "${type}") { fields { name } } }`);
      const fields = d?.data?.__type?.fields?.map(f => f.name);
      if (fields) {
        results[type] = fields.includes('headshots') ? `✅ HAS HEADSHOTS: ${fields.join(', ')}` : fields;
      }
    } catch(e) { results[type] = { error: e.message }; }
  }

  // Also check all schema types that contain "Segment" (where headshots might be)
  try {
    const d = await q(`{
      __schema { types { name kind } }
    }`);
    const segmentTypes = d?.data?.__schema?.types
      ?.map(t => t.name)
      .filter(n => n.includes('Segment') || n.includes('Headshot') || n.includes('Round'));
    results.segmentAndRoundTypes = segmentTypes;
  } catch(e) { results.segmentAndRoundTypes = { error: e.message }; }

  return res.json({ results });
}
