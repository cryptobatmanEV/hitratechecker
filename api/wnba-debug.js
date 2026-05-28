export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const get = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { headers: {'User-Agent': UA}, signal: ctrl.signal });
    clearTimeout(t);
    return r.json();
  };

  const id = '4433403';
  const out = {};

  // Correct path: events.items
  const eventlog = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}/eventlog?limit=5`);
  const items = eventlog.events?.items || [];
  out.item_count = items.length;
  out.first_item_keys = Object.keys(items[0] || {});
  out.first_item_full = items[0]; // full structure to see all fields

  // If statistics is a $ref, follow it
  const statsField = items[0]?.statistics;
  if (statsField?.$ref) {
    const stats = await get(statsField.$ref);
    out.stats_keys = Object.keys(stats);
    out.stats_categories = stats.splits?.categories?.map(c => ({
      name: c.name,
      stats: c.stats?.map(s => `${s.name}=${s.value}`)
    }));
  } else if (Array.isArray(statsField)) {
    // Follow first item in array if it's a ref
    if (statsField[0]?.$ref) {
      const stats = await get(statsField[0].$ref);
      out.stats_array_ref_keys = Object.keys(stats);
      out.stats_categories = stats.splits?.categories?.map(c => ({
        name: c.name,
        stats: c.stats?.map(s => `${s.name}=${s.value}`)
      }));
    }
  } else {
    out.stats_inline = statsField;
  }

  return res.json(out);
}
