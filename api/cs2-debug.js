export const config = { maxDuration: 30 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // Test 1: render=false (current approach)
  try {
    const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/20462/story?startDate=2025-01-01&endDate=2026-05-12')}&render=false`);
    results.render_false = { status: r.status, ok: r.ok, length: (await r.text()).length };
  } catch(e) { results.render_false = { error: e.message }; }

  // Test 2: render=true (JS rendering)
  try {
    const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/20462/story?startDate=2025-01-01&endDate=2026-05-12')}&render=true`);
    const text = await r.text();
    results.render_true = { status: r.status, ok: r.ok, length: text.length, hasTable: text.includes('stats-matches-table') };
  } catch(e) { results.render_true = { error: e.message }; }

  // Test 3: country_code=us
  try {
    const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/20462/story?startDate=2025-01-01&endDate=2026-05-12')}&render=false&country_code=us`);
    results.country_us = { status: r.status, ok: r.ok, length: (await r.text()).length };
  } catch(e) { results.country_us = { error: e.message }; }

  return res.json(results);
}
