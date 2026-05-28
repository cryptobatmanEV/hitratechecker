export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'Referer': 'https://stats.wnba.com/',
    'Origin': 'https://stats.wnba.com',
  };

  const results = {};

  // One request at a time, stop as soon as one works
  const tests = [
    ['2025_current',  'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2025&IsOnlyCurrentSeason=1'],
    ['2025_all',      'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2025&IsOnlyCurrentSeason=0'],
    ['2024_all',      'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2024&IsOnlyCurrentSeason=0'],
    ['2026_current',  'https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=2026&IsOnlyCurrentSeason=1'],
  ];

  for (const [label, url] of tests) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 7000);
      const r = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(t);
      const text = await r.text();
      results[label] = {
        status: r.status,
        ok: r.ok,
        is_json: text.trim().startsWith('{'),
        length: text.length,
        preview: text.slice(0, 150),
      };
      // Stop after first success
      if (r.ok && text.trim().startsWith('{')) {
        results._first_working = label;
        break;
      }
    } catch (e) {
      results[label] = { error: e.message };
    }
  }

  return res.json(results);
}
