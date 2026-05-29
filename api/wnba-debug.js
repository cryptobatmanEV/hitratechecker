export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id || '4433403';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  const get = async (url) => {
    const r = await fetch(url.replace('http://','https://'), { headers:{'User-Agent':UA} });
    if (!r.ok) throw new Error(`ESPN ${r.status}: ${url.slice(0,80)}`);
    return r.json();
  };

  const out = {};

  // Step 1: get first played item
  const el = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2026/athletes/${id}/eventlog?limit=5`);
  const items = (el.events?.items || []).filter(i => i.played);
  out.played_items_count = items.length;

  if (!items.length) { return res.json({ ...out, error: 'no played items' }); }

  const item = items[0];
  out.item_stats_ref = item.statistics?.$ref || 'MISSING';
  out.item_comp_ref  = item.competition?.$ref  || 'MISSING';

  // Step 2: fetch stats $ref
  try {
    const stats = await get(item.statistics.$ref);
    out.stats_ok = true;
    out.stats_categories = (stats.splits?.categories || []).map(c => c.name);
    const flat = {};
    for (const cat of stats.splits?.categories || [])
      for (const s of cat.stats || []) flat[s.name] = s.value;
    out.stats_pts   = flat.points;
    out.stats_reb   = flat.rebounds;
    out.stats_ast   = flat.assists;
  } catch(e) { out.stats_error = e.message; }

  // Step 3: fetch competition $ref
  try {
    const comp = await get(item.competition.$ref);
    out.comp_ok    = true;
    out.comp_date  = comp.date;
    out.comp_competitor_count = comp.competitors?.length;
    out.comp_first_competitor_keys = Object.keys(comp.competitors?.[0] || {});
    out.comp_competitor_ids = comp.competitors?.map(c => c.id);
    out.comp_scores = comp.competitors?.map(c => ({ id: c.id, score: c.score }));
  } catch(e) { out.comp_error = e.message; }

  return res.json(out);
}
