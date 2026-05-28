export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const get = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { headers: {'User-Agent': UA}, signal: ctrl.signal });
    clearTimeout(t);
    return { status: r.status, ok: r.ok, data: await r.json() };
  };

  // Step 1: Full structure of first search result for "clark"
  const search = await get('https://site.api.espn.com/apis/common/v3/search?query=clark&limit=3&type=player&sport=basketball&league=wnba');
  const firstItem = search.data?.items?.[0];
  const playerId = firstItem?.id;

  const out = {
    search_item_keys: firstItem ? Object.keys(firstItem) : 'no items',
    search_item_full: firstItem,
    player_id_found: playerId,
  };

  // Step 2: Test gamelog with that player ID
  if (playerId) {
    const gl = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/athletes/${playerId}/gamelog`);
    out.gamelog = {
      status: gl.status,
      ok: gl.ok,
      top_level_keys: gl.data ? Object.keys(gl.data) : null,
      has_season_types: !!gl.data?.seasonTypes,
      season_type_count: gl.data?.seasonTypes?.length,
      first_category: gl.data?.seasonTypes?.[0]?.categories?.[0]?.names,
      event_count: gl.data?.seasonTypes?.[0]?.categories?.[0]?.events?.length,
    };
  }

  return res.json(out);
}
