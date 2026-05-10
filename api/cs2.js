const FACEIT_KEY  = process.env.FACEIT_API_KEY;
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';

// ── Curated DFS pro list — players who regularly appear on PrizePicks/Sleeper ─
// Format: searchkey → { id: HLTV_ID, slug: HLTV_slug, display: shown_name }
const PRO_LIST = {
  // EU Tier 1
  'niko':        { id: 9816,  slug: 'NiKo',        display: 'NiKo' },
  'zywoo':       { id: 11893, slug: 'ZywOo',       display: 'ZywOo' },
  'device':      { id: 7592,  slug: 'device',      display: 'device' },
  's1mple':      { id: 7998,  slug: 's1mple',      display: 's1mple' },
  'm0nesy':      { id: 20399, slug: 'm0NESY',      display: 'm0NESY' },
  'rain':        { id: 8183,  slug: 'rain',        display: 'rain' },
  'ropz':        { id: 16015, slug: 'ropz',        display: 'ropz' },
  'broky':       { id: 18053, slug: 'broky',       display: 'broky' },
  'karrigan':    { id: 429,   slug: 'karrigan',    display: 'karrigan' },
  'frozen':      { id: 16255, slug: 'frozen',      display: 'frozen' },
  'blamef':      { id: 15219, slug: 'blameF',      display: 'blameF' },
  'torzsi':      { id: 20655, slug: 'torzsi',      display: 'torzsi' },
  'xertion':     { id: 22049, slug: 'xertioN',     display: 'xertioN' },
  'nicoodoz':    { id: 14936, slug: 'nicoodoz',    display: 'nicoodoz' },
  'teses':       { id: 9312,  slug: 'TeSeS',       display: 'TeSeS' },
  'sjuush':      { id: 18068, slug: 'sjuush',      display: 'sjuush' },
  'jabbi':       { id: 19244, slug: 'jabbi',       display: 'jabbi' },
  'dupreeh':     { id: 3965,  slug: 'dupreeh',     display: 'dupreeh' },
  'magisk':      { id: 9032,  slug: 'Magisk',      display: 'Magisk' },
  'krimz':       { id: 6920,  slug: 'KRIMZ',       display: 'KRIMZ' },
  'hampus':      { id: 11816, slug: 'hampus',      display: 'hampus' },
  'headtr1ck':   { id: 20643, slug: 'headtr1ck',  display: 'headtr1ck' },
  'apex':        { id: 7322,  slug: 'apEX',        display: 'apEX' },
  'mezii':       { id: 16380, slug: 'mezii',       display: 'mezii' },
  'spinx':       { id: 19775, slug: 'Spinx',       display: 'Spinx' },
  'flamez':      { id: 19488, slug: 'flameZ',      display: 'flameZ' },
  // CIS
  'electronic':  { id: 8816,  slug: 'electronic',  display: 'electronic' },
  'b1t':         { id: 20586, slug: 'b1t',          display: 'b1t' },
  'perfecto':    { id: 17351, slug: 'Perfecto',    display: 'Perfecto' },
  'im':          { id: 20710, slug: 'iM',           display: 'iM' },
  'jl':          { id: 21566, slug: 'jL',           display: 'jL' },
  'sh1ro':       { id: 18594, slug: 'sh1ro',       display: 'sh1ro' },
  'ax1le':       { id: 18700, slug: 'Ax1Le',       display: 'Ax1Le' },
  'hobbit':      { id: 10314, slug: 'HObbit',      display: 'HObbit' },
  'jame':        { id: 9960,  slug: 'Jame',        display: 'Jame' },
  'degster':     { id: 17757, slug: 'degster',     display: 'degster' },
  'sdy':         { id: 18098, slug: 'sdy',          display: 'sdy' },
  // NA
  'twistzz':     { id: 10394, slug: 'Twistzz',     display: 'Twistzz' },
  'naf':         { id: 10907, slug: 'NAF',          display: 'NAF' },
  'elige':       { id: 9176,  slug: 'EliGE',       display: 'EliGE' },
  'grim':        { id: 18008, slug: 'Grim',        display: 'Grim' },
  'floppy':      { id: 17989, slug: 'floppy',      display: 'floppy' },
  'brehze':      { id: 12148, slug: 'brehze',      display: 'brehze' },
  'yekindar':    { id: 16049, slug: 'YEKINDAR',    display: 'YEKINDAR' },
  'story':       { id: 17907, slug: 'story',       display: 'story' },
  'sonic':       { id: 20878, slug: 'Sonic',       display: 'Sonic' },
  'hallzerk':    { id: 17976, slug: 'hallzerk',    display: 'hallzerk' },
  'konfig':      { id: 10907, slug: 'k0nfig',      display: 'k0nfig' },
  'k0nfig':      { id: 12696, slug: 'k0nfig',      display: 'k0nfig' },
  'xantares':    { id: 11378, slug: 'XANTARES',    display: 'XANTARES' },
  'woxic':       { id: 11816, slug: 'woxic',       display: 'woxic' },
  // BR
  'fallen':      { id: 2023,  slug: 'FalleN',      display: 'FalleN' },
  'kscerato':    { id: 16695, slug: 'KSCERATO',    display: 'KSCERATO' },
  'yuurih':      { id: 15631, slug: 'yuurih',      display: 'yuurih' },
  'dgt':         { id: 16833, slug: 'dgt',          display: 'dgt' },
  'chelo':       { id: 15972, slug: 'chelo',       display: 'chelo' },
  'art':         { id: 16044, slug: 'arT',          display: 'arT' },
  'meyern':      { id: 18278, slug: 'meyern',      display: 'meyern' },
  'luchov':      { id: 19466, slug: 'luchov',      display: 'luchov' },
  'max':         { id: 21050, slug: 'max',          display: 'max' },
  // Other
  'jks':         { id: 11393, slug: 'jks',          display: 'jks' },
  'hunter':      { id: 14698, slug: 'huNter-',     display: 'huNter-' },
  'hooxi':       { id: 9345,  slug: 'HooXi',       display: 'HooXi' },
  'malbsmd':     { id: 21466, slug: 'MalbsMd',     display: 'MalbsMd' },
  'skullz':      { id: 21501, slug: 'skullz',      display: 'skullz' },
  'staehr':      { id: 21034, slug: 'Staehr',      display: 'Staehr' },
  'roej':        { id: 15620, slug: 'roeJ',        display: 'roeJ' },
  'lucky':       { id: 15418, slug: 'Lucky',       display: 'Lucky' },
};

function findInProList(query) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Exact match first
  if (PRO_LIST[q]) return [PRO_LIST[q]];
  // Partial match
  return Object.entries(PRO_LIST)
    .filter(([k]) => k.includes(q) || q.includes(k))
    .sort((a, b) => Math.abs(a[0].length - q.length) - Math.abs(b[0].length - q.length))
    .slice(0, 5)
    .map(([, v]) => v);
}

async function scraperFetch(url, renderJs = false) {
  const params = `api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}${renderJs ? '&render=true' : ''}`;
  const r = await fetch(`https://api.scraperapi.com?${params}`, {
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

// Search HLTV with JS rendering — finds any player
async function searchHLTVRendered(query) {
  const html    = await scraperFetch(`https://www.hltv.org/search?query=${encodeURIComponent(query)}`, true);
  const players = [];
  // Player links: href="/player/9816/NiKo"
  const rx = /href="\/player\/(\d+)\/([^"?]+)"/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    players.push({ id: m[1], slug: m[2], display: m[2] });
  }
  const seen = new Set();
  return players.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).slice(0, 6);
}

function parseMatchesTable(html) {
  const games = [];
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableM;
  while ((tableM = tableRx.exec(html)) !== null) {
    const tHTML = tableM[1];
    if (!/>\s*[Kk]\s*</.test(tHTML)) continue;

    // Read headers
    const headers = [];
    const hRx = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let hm;
    while ((hm = hRx.exec(tHTML)) !== null)
      headers.push(hm[1].replace(/<[^>]+>/g, '').trim().toLowerCase());

    const ki  = headers.findIndex(h => h === 'k' || h === 'kills');
    const di  = headers.findIndex(h => h === 'd' || h === 'deaths');
    const dti = headers.findIndex(h => h === 'date');
    const mi  = headers.findIndex(h => h === 'map');
    const oi  = headers.findIndex(h => h.includes('opp'));
    const ri  = headers.findIndex(h => h === 'result' || h === 'res');
    if (ki === -1 || di === -1) continue;

    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowM;
    while ((rowM = rowRx.exec(tHTML)) !== null) {
      if (/<th/i.test(rowM[1])) continue; // skip header rows
      const cells = [];
      const cRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cm;
      while ((cm = cRx.exec(rowM[1])) !== null)
        cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
      if (cells.length <= Math.max(ki, di)) continue;
      const kills  = parseInt(cells[ki]);
      const deaths = parseInt(cells[di]);
      if (isNaN(kills) || kills < 0 || isNaN(deaths) || deaths < 0) continue;
      games.push({
        kills, deaths, assists: 0,
        win:   ri >= 0 ? cells[ri]?.toLowerCase().startsWith('w') : null,
        map:   mi >= 0 ? cells[mi] || '' : '',
        _date: dti >= 0 ? cells[dti] || '' : '',
        _opp:  oi >= 0 ? cells[oi] || '' : '',
      });
    }
    if (games.length) break;
  }
  return games;
}

function groupIntoSeries(maps) {
  const series = [];
  let i = 0;
  while (i < maps.length) {
    const cur = maps[i], group = [cur];
    while (i + group.length < maps.length) {
      const next = maps[i + group.length];
      const days = Math.abs(new Date(cur._date) - new Date(next._date)) / 86400000;
      if (next._opp === cur._opp && days <= 2) group.push(next);
      else break;
    }
    const wins = group.filter(g => g.win).length;
    series.push({
      kills:   group.reduce((s, g) => s + g.kills, 0),
      deaths:  group.reduce((s, g) => s + g.deaths, 0),
      assists: 0,
      win:     group.length === 1 ? cur.win : wins > group.length / 2,
      maps:    group.map(g => ({ kills: g.kills, deaths: g.deaths, assists: 0, map: g.map })),
      _date:   cur._date,
      _opp:    cur._opp,
    });
    i += group.length;
  }
  return series;
}

async function faceitFetch(path) {
  const r = await fetch(`${FACEIT_BASE}${path}`, { headers: { Authorization: `Bearer ${FACEIT_KEY}` } });
  if (!r.ok) throw new Error(`FACEIT ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { action, nickname, playerId } = req.query;

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      // 1. Curated pro list (free, instant)
      const proHits = findInProList(nickname || '');
      if (proHits.length) {
        return res.json({
          players: proHits.map(p => ({
            id: `hltv_${p.id}_${p.slug}`, name: p.display, sub: 'Pro · HLTV tournament data'
          }))
        });
      }

      // 2. HLTV search with JS rendering (5 credits — only if not in list)
      if (SCRAPER_KEY) {
        try {
          const hltvResults = await searchHLTVRendered(nickname);
          if (hltvResults.length) {
            return res.json({
              players: hltvResults.map(p => ({
                id: `hltv_${p.id}_${p.slug}`, name: p.display, sub: 'Pro · HLTV tournament data'
              }))
            });
          }
        } catch(e) { /* fall through */ }
      }

      // 3. FACEIT Level 10 fallback
      if (FACEIT_KEY) {
        const d     = await faceitFetch(`/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=10`);
        const items = (d.items || [])
          .filter(p => parseInt(p.games?.cs2?.skill_level) === 10)
          .sort((a, b) => (parseInt(b.games?.cs2?.faceit_elo) || 0) - (parseInt(a.games?.cs2?.faceit_elo) || 0))
          .slice(0, 5);
        if (items.length) return res.json({
          players: items.map(p => ({
            id: p.player_id, name: p.nickname,
            sub: `Lvl ${p.games?.cs2?.skill_level} · ELO ${p.games?.cs2?.faceit_elo} · FACEIT only`
          }))
        });
      }

      return res.json({ players: [] });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      if (playerId?.startsWith('hltv_')) {
        if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });
        const parts    = playerId.split('_');
        const hltvId   = parts[1];
        const hltvSlug = parts.slice(2).join('_');
        const end      = new Date().toISOString().split('T')[0];
        const start    = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const url      = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;

        const html    = await scraperFetch(url, false); // SSR — no JS needed
        const rawMaps = parseMatchesTable(html);

        if (!rawMaps.length) {
          return res.status(404).json({
            error: `No match data found for ${hltvSlug}. Try the debug endpoint: /api/cs2?action=debug&playerId=${playerId}`,
            htmlLength: html.length,
          });
        }
        return res.json({ games: groupIntoSeries(rawMaps).slice(0, 40) });
      }

      // FACEIT fallback
      if (FACEIT_KEY) {
        const history = await faceitFetch(`/players/${playerId}/history?game=cs2&limit=20&offset=0`);
        const items   = (history.items || []).filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');
        const games   = (await Promise.all(items.slice(0, 15).map(async m => {
          try {
            const stats  = await faceitFetch(`/matches/${m.match_id}/stats`);
            const round  = stats.rounds?.[0];
            const team   = round?.teams?.find(t => t.players?.some(p => p.player_id === playerId));
            const player = team?.players?.find(p => p.player_id === playerId);
            if (!player) return null;
            return {
              kills: parseInt(player.player_stats?.Kills || 0),
              deaths: parseInt(player.player_stats?.Deaths || 0),
              assists: parseInt(player.player_stats?.Assists || 0),
              win: team.team_stats?.['Team Win'] === '1',
              _date: new Date(m.finished_at * 1000).toISOString().split('T')[0],
              _opp: '', maps: [],
            };
          } catch { return null; }
        }))).filter(Boolean);
        return res.json({ games });
      }
      return res.json({ games: [] });
    }

    // ── Debug ────────────────────────────────────────────────────────────────
    if (action === 'debug') {
      if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });
      const parts    = (playerId || 'hltv_9816_NiKo').split('_');
      const hltvId   = parts[1] || '9816';
      const hltvSlug = parts.slice(2).join('_') || 'NiKo';
      const end      = new Date().toISOString().split('T')[0];
      const start    = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
      const url      = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;
      const html     = await scraperFetch(url, false);
      const rawMaps  = parseMatchesTable(html);
      const tableM   = html.match(/<table[\s\S]*?<\/table>/i);
      return res.json({
        url, htmlLength: html.length,
        tablesFound: (html.match(/<table/gi) || []).length,
        mapsFound: rawMaps.length,
        first3: rawMaps.slice(0, 3),
        tableSnippet: tableM ? tableM[0].slice(0, 1500) : 'no table found',
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
