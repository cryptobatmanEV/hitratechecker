export const config = { maxDuration: 30 };

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/html, */*',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Test VLR.gg internal JSON endpoints (XHR calls the site makes)
  const endpoints = [
    'https://www.vlr.gg/player/1093/aspas?tab=matches',
    'https://www.vlr.gg/player/matches/1093',
    'https://www.vlr.gg/api/v1/player/1093',
    'https://www.vlr.gg/stats?player_id=1093',
    'https://www.vlr.gg/search/?q=aspas&type=players',
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: H });
      const text = await r.text();
      const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
      out[url.replace('https://www.vlr.gg', '')] = {
        status: r.status,
        is_json: isJson,
        length: text.length,
        sample: text.slice(0, 300),
        has_kills: text.toLowerCase().includes('kill'),
        has_acs: text.toLowerCase().includes('acs'),
        has_player_name: text.toLowerCase().includes('aspas'),
      };
    } catch (e) {
      out[url] = { error: e.message };
    }
  }

  // Also test: can we get the full vlrggapi stats to find aspas's ID
  try {
    const r = await fetch('https://vlrggapi.vercel.app/stats?region=all&timespan=all');
    const d = await r.json();
    const segs = d?.data?.segments || [];
    const found = segs.find(s => s.player?.toLowerCase().includes('aspas') ||
                                  s.player?.toLowerCase().includes('zekken'));
    out.vlrggapi_player_search = {
      total_players: segs.length,
      found_player: found || 'not found',
      has_id_field: segs[0] ? Object.keys(segs[0]).includes('id') : false,
    };
  } catch (e) {
    out.vlrggapi_player_search = { error: e.message };
  }

  return res.json(out);
}
