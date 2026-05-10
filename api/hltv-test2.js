// api/hltv-test2.js — Tests free CS2 pro data sources from Vercel IPs. Delete after testing.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { player = 'NiKo' } = req.query;
  const out = {};

  // 1. HLTV main page (Cloudflare protected — expect 403 or block)
  try {
    const r = await fetch(`https://www.hltv.org/stats/players`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html', 'Referer': 'https://www.hltv.org/'
      }
    });
    const text = await r.text();
    out.hltv = { status: r.status, ok: r.ok, length: text.length, snippet: text.slice(0,150) };
  } catch(e) { out.hltv = { error: e.message }; }

  // 2. GRID — official data partner for BLAST, IEM, ESL, PGL (free community tier)
  try {
    const r = await fetch(`https://api.grid.gg/file-download/end-state/csgo/series/1`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await r.text();
    out.grid_test = { status: r.status, ok: r.ok, snippet: text.slice(0,200) };
  } catch(e) { out.grid_test = { error: e.message }; }

  // 3. GRID GraphQL — central API
  try {
    const r = await fetch('https://api.grid.gg/central-data/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ query: `{ allSeries(first:1){ edges{ node{ id startTimeScheduled } } } }` })
    });
    const text = await r.text();
    out.grid_graphql = { status: r.status, ok: r.ok, snippet: text.slice(0,300) };
  } catch(e) { out.grid_graphql = { error: e.message }; }

  // 4. BLAST.tv — tournament organizer internal API
  try {
    const r = await fetch(`https://blast.tv/api/v1/players?search=${encodeURIComponent(player)}&limit=3`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://blast.tv/' }
    });
    const text = await r.text();
    out.blast = { status: r.status, ok: r.ok, snippet: text.slice(0,300) };
  } catch(e) { out.blast = { error: e.message }; }

  // 5. csstats.gg
  try {
    const r = await fetch(`https://csstats.gg/player/search?q=${encodeURIComponent(player)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await r.text();
    out.csstats = { status: r.status, ok: r.ok, snippet: text.slice(0,300) };
  } catch(e) { out.csstats = { error: e.message }; }

  // 6. tracker.gg CS2
  try {
    const r = await fetch(`https://api.tracker.gg/api/v2/cs2/standard/search?platform=steam&query=${encodeURIComponent(player)}&autocomplete=true`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tracker.gg/' }
    });
    const text = await r.text();
    out.tracker = { status: r.status, ok: r.ok, snippet: text.slice(0,300) };
  } catch(e) { out.tracker = { error: e.message }; }

  return res.json({ player, results: out });
}
