// api/hltv-test.js — Tests whether Vercel IPs can reach HLTV at all (no npm needed)
// Hit: /api/hltv-test?player=NiKo
// Remove this file after testing.

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { player = 'NiKo' } = req.query;

  const results = {};

  // Test 1: HLTV search page (main site — Cloudflare protected)
  try {
    const r = await fetch(`https://www.hltv.org/search?query=${encodeURIComponent(player)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.hltv.org/',
      }
    });
    results.hltv_main = { status: r.status, ok: r.ok, length: (await r.text()).length };
  } catch(e) { results.hltv_main = { error: e.message }; }

  // Test 2: HLTV player stats API endpoint (internal XHR — may not have CF)
  try {
    const r = await fetch(`https://www.hltv.org/stats/players?startDate=2025-01-01&endDate=2026-12-31&rankingFilter=Top50`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.hltv.org/',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });
    const text = await r.text();
    results.hltv_stats = { status: r.status, ok: r.ok, snippet: text.slice(0, 200) };
  } catch(e) { results.hltv_stats = { error: e.message }; }

  // Test 3: BLAST.tv public API (tournament organizer — likely no CF)
  try {
    const r = await fetch(`https://blast.tv/api/v1/players?search=${encodeURIComponent(player)}&limit=5`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await r.text();
    results.blast_api = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
  } catch(e) { results.blast_api = { error: e.message }; }

  // Test 4: csstats.gg (third-party aggregator)
  try {
    const r = await fetch(`https://csstats.gg/api/search?q=${encodeURIComponent(player)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await r.text();
    results.csstats = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
  } catch(e) { results.csstats = { error: e.message }; }

  return res.json({ player, results });
}

