export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;

async function q(url, query) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query })
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Try known GRID endpoints for Series State API
  const endpoints = [
    'https://api-op.grid.gg/live-data-feed/series-state/graphql',
    'https://api-op.grid.gg/live-data-feed/graphql',
    'https://api-op.grid.gg/series-state/graphql',
  ];

  // Test each endpoint with a simple introspection
  for (const ep of endpoints) {
    try {
      const r = await q(ep, `{ __schema { queryType { name } } }`);
      out[ep] = r?.data ? 'WORKS: ' + JSON.stringify(r.data) : r?.errors?.[0]?.message || 'no response';
    } catch(e) {
      out[ep] = 'ERROR: ' + e.message;
    }
  }

  // Also check statistics-feed for series state queries
  const r2 = await q('https://api-op.grid.gg/statistics-feed/graphql',
    `{ __schema { queryType { fields { name } } } }`);
  out.stats_queries = r2?.data?.__schema?.queryType?.fields?.map(f=>f.name) || r2?.errors;

  return res.json(out);
}
