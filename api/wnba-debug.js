export const config = { maxDuration: 30 };

const HEADERS = {
  'Host': 'stats.wnba.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Referer': 'https://stats.wnba.com/',
  'Origin': 'https://stats.wnba.com',
  'Connection': 'keep-alive',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Test 1: Can we reach stats.wnba.com at all?
  try {
    const url = 'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2026&IsOnlyCurrentSeason=1';
    const r = await fetch(url, { headers: HEADERS });
    const text = await r.text();
    out.test1_allplayers_2026 = {
      status: r.status,
      ok: r.ok,
      content_type: r.headers.get('content-type'),
      body_start: text.slice(0, 200),
      is_json: text.trim().startsWith('{') || text.trim().startsWith('['),
    };
  } catch (e) {
    out.test1_allplayers_2026 = { error: e.message };
  }

  // Test 2: Try 2025 season (season might not be 2026 yet)
  try {
    const url = 'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2025&IsOnlyCurrentSeason=0';
    const r = await fetch(url, { headers: HEADERS });
    const text = await r.text();
    out.test2_allplayers_2025 = {
      status: r.status,
      ok: r.ok,
      is_json: text.trim().startsWith('{'),
      body_start: text.slice(0, 200),
    };
  } catch (e) {
    out.test2_allplayers_2025 = { error: e.message };
  }

  // Test 3: Try without the Host header (sometimes causes issues)
  try {
    const { Host, ...noHost } = HEADERS;
    const url = 'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2025&IsOnlyCurrentSeason=0';
    const r = await fetch(url, { headers: noHost });
    const text = await r.text();
    out.test3_no_host_header = {
      status: r.status,
      ok: r.ok,
      is_json: text.trim().startsWith('{'),
      body_start: text.slice(0, 200),
    };
  } catch (e) {
    out.test3_no_host_header = { error: e.message };
  }

  // Test 4: NBA stats API (same structure, known to work)
  try {
    const r = await fetch('https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=2024-25&IsOnlyCurrentSeason=1', {
      headers: { ...HEADERS, Host: 'stats.nba.com', Referer: 'https://stats.nba.com/', Origin: 'https://stats.nba.com' }
    });
    const text = await r.text();
    out.test4_nba_for_comparison = {
      status: r.status,
      ok: r.ok,
      is_json: text.trim().startsWith('{'),
      body_start: text.slice(0, 150),
    };
  } catch (e) {
    out.test4_nba_for_comparison = { error: e.message };
  }

  return res.json(out);
}
