export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id || '4433403';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const get = async (url) => {
    const r = await fetch(url.replace('http://','https://'), { headers:{'User-Agent':UA} });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text.slice(0,200); }
    return { status: r.status, ok: r.ok, data };
  };

  const out = { id, year: new Date().getFullYear() };

  // Test both URL forms — with and without season
  const r1 = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}/eventlog?limit=5`);
  out.url_no_season = { status: r1.status, events_count: r1.data?.events?.count, items_length: r1.data?.events?.items?.length, first_item_keys: Object.keys(r1.data?.events?.items?.[0]||{}) };

  const r2 = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2026/athletes/${id}/eventlog?limit=5`);
  out.url_with_2026 = { status: r2.status, events_count: r2.data?.events?.count, items_length: r2.data?.events?.items?.length, first_item_keys: Object.keys(r2.data?.events?.items?.[0]||{}) };

  const r3 = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2025/athletes/${id}/eventlog?limit=5`);
  out.url_with_2025 = { status: r3.status, events_count: r3.data?.events?.count, items_length: r3.data?.events?.items?.length };

  // Check the played flag on items from the no-season URL
  const items = r1.data?.events?.items || [];
  out.played_flags = items.map(i => ({ played: i.played, has_stats: !!i.statistics?.$ref }));

  return res.json(out);
}
