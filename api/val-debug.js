export const config = { maxDuration: 30 };

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Test 1: Can we fetch VLR.gg search directly (no ScraperAPI)?
  try {
    const r = await fetch('https://www.vlr.gg/search/?q=aspas&type=players', { headers: HEADERS });
    out.vlrgg_search_direct = {
      status: r.status,
      blocked: r.status === 403 || r.status === 503,
      content_length: (await r.text()).length,
    };
  } catch (e) {
    out.vlrgg_search_direct = { error: e.message };
  }

  // Test 2: Can we fetch a VLR.gg player page directly? (aspas = player id 2)
  try {
    const r = await fetch('https://www.vlr.gg/player/2/aspas', { headers: HEADERS });
    const html = await r.text();
    out.vlrgg_player_direct = {
      status: r.status,
      blocked: r.status === 403 || r.status === 503,
      has_match_table: html.includes('wf-table'),
      has_kills: html.includes('kills') || html.includes('kill'),
      content_length: html.length,
      sample: html.slice(0, 300),
    };
  } catch (e) {
    out.vlrgg_player_direct = { error: e.message };
  }

  // Test 3: Does vlrggapi community API have per-match data?
  try {
    const r = await fetch('https://vlrggapi.vercel.app/stats?region=na&timespan=30');
    const d = await r.json();
    const seg = d?.data?.segments?.[0];
    out.vlrggapi_stats = {
      status: r.status,
      has_data: !!seg,
      sample_fields: seg ? Object.keys(seg) : [],
      has_per_match: false, // aggregate only based on docs
    };
  } catch (e) {
    out.vlrggapi_stats = { error: e.message };
  }

  // Test 4: Does vlr.orlandomm.net have player match history?
  try {
    const r = await fetch('https://vlr.orlandomm.net/api/v1/players?limit=1&page=1');
    const d = await r.json();
    out.orlando_players = {
      status: r.status,
      sample: JSON.stringify(d).slice(0, 400),
    };
  } catch (e) {
    out.orlando_players = { error: e.message };
  }

  return res.json(out);
}
