export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = {};
  const HEADERS = {
    'User-Agent': 'EV Cave Hit Rate Tool/1.0 (contact@theevcave.com)',
    'Accept': 'application/json'
  };

  // 1. Liquipedia Data API v3 - player lookup
  try {
    const r = await fetch('https://api.liquipedia.net/api/v3/player?wiki=counterstrike&name=dgt&limit=1', { headers: HEADERS });
    const text = await r.text();
    R.lp_player = { status: r.status, preview: text.slice(0, 400) };
  } catch(e) { R.lp_player_error = e.message; }

  // 2. Liquipedia Data API v3 - match results for FURIA
  try {
    const r = await fetch('https://api.liquipedia.net/api/v3/match?wiki=counterstrike&opponent=FURIA&limit=3', { headers: HEADERS });
    const text = await r.text();
    R.lp_matches = { status: r.status, preview: text.slice(0, 400) };
  } catch(e) { R.lp_matches_error = e.message; }

  // 3. Liquipedia Data API v3 - placements/tournament results
  try {
    const r = await fetch('https://api.liquipedia.net/api/v3/placement?wiki=counterstrike&player=dgt&limit=5', { headers: HEADERS });
    const text = await r.text();
    R.lp_placements = { status: r.status, preview: text.slice(0, 400) };
  } catch(e) { R.lp_placements_error = e.message; }

  // 4. MediaWiki API - try fetching dgt player page content directly
  try {
    const r = await fetch('https://liquipedia.net/counterstrike/api.php?action=parse&page=Dgt&prop=wikitext&format=json', { headers: HEADERS });
    if (r.ok) {
      const d = await r.json();
      const wikitext = d.parse?.wikitext?.['*'] || '';
      // Look for stats patterns like | kills = or similar
      R.lp_dgt_page = {
        status: r.status,
        page_exists: !!d.parse?.title,
        title: d.parse?.title,
        wikitext_sample: wikitext.slice(0, 600)
      };
    } else {
      R.lp_dgt_page = { status: r.status };
    }
  } catch(e) { R.lp_dgt_error = e.message; }

  return res.status(200).json(R);
}
