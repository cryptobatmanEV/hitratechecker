// api/hltv-test2.js — No npm deps, tests 6 CS2 data sources from Vercel IPs
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { player = 'NiKo' } = req.query;
  const results = {};

  // 1. HLTV main (Cloudflare protected)
  try {
    const r = await fetch(`https://www.hltv.org/search?query=${encodeURIComponent(player)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'text/html', 'Referer': 'https://www.hltv.org/' }
    });
    results.hltv_main = { status: r.status, ok: r.ok, length: (await r.text()).length };
  } catch(e) { results.hltv_main = { error: e.message }; }

  // 2. HLTV stats XHR endpoint
  try {
    const r = await fetch(`https://www.hltv.org/stats/players?startDate=2025-01-01&endDate=2026-12-31&rankingFilter=Top50`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.hltv.org/', 'X-Requested-With': 'XMLHttpRequest' }
    });
    const text = await r.text();
    results.hltv_stats = { status: r.status, ok: r.ok, snippet: text.slice(0, 200) };
  } catch(e) { results.hltv_stats = { error: e.message }; }

  // 3. BLAST.tv API
  try {
    const r = await fetch(`https://blast.tv/api/v1/players?search=${encodeURIComponent(player)}&limit=5`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await r.text();
    results.blast_api = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
  } catch(e) { results.blast_api = { error: e.message }; }

  // 4. csstats.gg
  try {
    const r = await fetch(`https://csstats.gg/api/search?q=${encodeURIComponent(player)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await r.text();
    results.csstats = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
  } catch(e) { results.csstats = { error: e.message }; }

  // 5. tracker.gg
  try {
    const r = await fetch(`https://api.tracker.gg/api/v2/cs2/standard/search?platform=steam&query=${encodeURIComponent(player)}&autocomplete=true`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://tracker.gg/' }
    });
    const text = await r.text();
    results.tracker_gg = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
  } catch(e) { results.tracker_gg = { error: e.message }; }

  // 6. PandaScore no-auth (check if any data returns without a key)
  try {
    const r = await fetch(`https://api.pandascore.co/csgo/players?search[name]=${encodeURIComponent(player)}&per_page=3`, {
      headers: { 'Accept': 'application/json' }
    });
    const text = await r.text();
    results.pandascore_noauth = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
  } catch(e) { results.pandascore_noauth = { error: e.message }; }

  return res.json({ player, results });
}
