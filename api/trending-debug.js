export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function get(url) {
  const r = await fetch(url, { headers:{'User-Agent':UA} });
  return { status: r.status, ok: r.ok, data: r.ok ? await r.json().catch(()=>null) : null };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: get Drake Maye's ESPN ID
  const search = await get('https://site.api.espn.com/apis/common/v3/search?query=Drake+Maye&limit=5&type=player&sport=football&league=nfl');
  const maye = (search.data?.items||[]).find(p=>p.displayName?.includes('Maye'));
  out.player = maye ? { id:maye.id, name:maye.displayName } : null;
  if (!maye) return res.json({error:'Drake Maye not found', search_result:search.data?.items?.slice(0,3)});

  const id = maye.id;
  const season = 2025;
  const BASE = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl`;

  // Step 2: try multiple URL patterns and show what each returns
  const tests = [
    // Generic eventlog (working)
    `${BASE}/seasons/${season}/athletes/${id}/eventlog?limit=50`,
    // Typed paths
    `${BASE}/seasons/${season}/types/2/athletes/${id}/eventlog?limit=50`,
    `${BASE}/seasons/${season}/types/3/athletes/${id}/eventlog?limit=50`,
    // Query param variations
    `${BASE}/seasons/${season}/athletes/${id}/eventlog?limit=50&seasontype=3`,
    `${BASE}/seasons/${season}/athletes/${id}/eventlog?limit=50&type=3`,
    `${BASE}/seasons/${season}/athletes/${id}/eventlog?limit=50&postseason=true`,
    // Direct athlete events
    `${BASE}/athletes/${id}/eventlog?season=${season}&limit=50`,
  ];

  out.url_tests = {};
  for (const url of tests) {
    const label = url.replace(BASE,'').replace(String(id),'PLAYER_ID');
    try {
      const r = await get(url);
      const items = r.data?.events?.items || [];
      out.url_tests[label] = {
        status: r.status,
        item_count: items.length,
        played_count: items.filter(i=>i.played).length,
        // Show seasonType of each played item
        game_season_types: items.filter(i=>i.played).map(i=>i.seasonType?.id||i.seasonType?.type||typeof i.seasonType),
        // Show what fields are on the first item
        first_item_keys: items[0] ? Object.keys(items[0]) : [],
        // Show first item's seasonType raw
        first_seasonType: items[0]?.seasonType,
      };
    } catch(e) {
      out.url_tests[label] = { error: e.message };
    }
  }

  return res.json(out);
}
