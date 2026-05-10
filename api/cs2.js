const FACEIT_KEY = process.env.FACEIT_API_KEY;
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';

// Curated HLTV pro list — CS2 DFS slate players
const HLTV_PROS = {
  'niko':       { id: 9816,  slug: 'niko',       display: 'NiKo' },
  'zywoo':      { id: 11893, slug: 'zywoo',      display: 'ZywOo' },
  'device':     { id: 7592,  slug: 'device',     display: 'device' },
  's1mple':     { id: 7998,  slug: 's1mple',     display: 's1mple' },
  'm0nesy':     { id: 20399, slug: 'm0nesy',     display: 'm0NESY' },
  'rain':       { id: 8183,  slug: 'rain',       display: 'rain' },
  'ropz':       { id: 16015, slug: 'ropz',       display: 'ropz' },
  'broky':      { id: 18053, slug: 'broky',      display: 'broky' },
  'karrigan':   { id: 429,   slug: 'karrigan',   display: 'karrigan' },
  'twistzz':    { id: 10394, slug: 'twistzz',    display: 'Twistzz' },
  'naf':        { id: 10907, slug: 'naf',         display: 'NAF' },
  'yekindar':   { id: 16049, slug: 'yekindar',   display: 'YEKINDAR' },
  'elige':      { id: 9176,  slug: 'elige',       display: 'EliGE' },
  'fallen':     { id: 2023,  slug: 'fallen',      display: 'FalleN' },
  'kscerato':   { id: 16695, slug: 'kscerato',   display: 'KSCERATO' },
  'yuurih':     { id: 15631, slug: 'yuurih',      display: 'yuurih' },
  'dgt':        { id: 16833, slug: 'dgt',          display: 'dgt' },
  'chelo':      { id: 15972, slug: 'chelo',        display: 'chelo' },
  'art':        { id: 16044, slug: 'art',           display: 'arT' },
  'floppy':     { id: 17989, slug: 'floppy',       display: 'floppy' },
  'brehze':     { id: 12148, slug: 'brehze',       display: 'brehze' },
  'grim':       { id: 18008, slug: 'grim',          display: 'Grim' },
  'sh1ro':      { id: 18594, slug: 'sh1ro',         display: 'sh1ro' },
  'ax1le':      { id: 18700, slug: 'ax1le',         display: 'Ax1Le' },
  'hobbit':     { id: 10314, slug: 'hobbit',        display: 'HObbit' },
  'electronic': { id: 8816,  slug: 'electronic',   display: 'electronic' },
  'b1t':        { id: 20586, slug: 'b1t',           display: 'B1T' },
  'jame':       { id: 9960,  slug: 'jame',          display: 'Jame' },
  'nicoodoz':   { id: 14936, slug: 'nicoodoz',      display: 'nicoodoz' },
  'teses':      { id: 9312,  slug: 'teses',          display: 'TeSeS' },
  'dupreeh':    { id: 3741,  slug: 'dupreeh',       display: 'dupreeh' },
  'magisk':     { id: 9032,  slug: 'magisk',        display: 'Magisk' },
  'blamef':     { id: 15219, slug: 'blamef',        display: 'blameF' },
  'jabbi':      { id: 19244, slug: 'jabbi',          display: 'jabbi' },
  'woxic':      { id: 11816, slug: 'woxic',          display: 'woxic' },
  'krimz':      { id: 6920,  slug: 'krimz',          display: 'KRIMZ' },
  'perfecto':   { id: 17351, slug: 'perfecto',      display: 'Perfecto' },
  'sdy':        { id: 18098, slug: 'sdy',             display: 'sdy' },
  'degster':    { id: 17757, slug: 'degster',        display: 'degster' },
  'headtr1ck':  { id: 20643, slug: 'headtr1ck',     display: 'headtr1ck' },
  'xantares':   { id: 11378, slug: 'xantares',      display: 'XANTARES' },
  'frozen':     { id: 16255, slug: 'frozen',         display: 'frozen' },
  'meyern':     { id: 18278, slug: 'meyern',        display: 'meyern' },
  'max':        { id: 7412,  slug: 'max',             display: 'max' },
  'luchov':     { id: 19466, slug: 'luchov',         display: 'luchov' },
};

async function scraperFetch(url) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

function parseMatchesTable(html) {
  const games = [];
  const tableRx = /<table[^>]*class="[^"]*stats-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i;
  const tableM  = html.match(tableRx);
  if (!tableM) return games;

  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowM;
  while ((rowM = rowRx.exec(tableM[1])) !== null) {
    const cells = [];
    const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellM;
    while ((cellM = cellRx.exec(rowM[1])) !== null) {
      cells.push(cellM[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    if (cells.length < 7) continue;
    const kills  = parseInt(cells[5]);
    const deaths = parseInt(cells[6]);
    if (isNaN(kills)) continue;
    games.push({
      kills,
      deaths,
      assists: 0,
      rating:  parseFloat(cells[8]) || null,
      map:     cells[2]?.trim() || '',
      win:     (cells[4] || '').toLowerCase().startsWith('w'),
      _date:   cells[0]?.trim() || '',
      _opp:    cells[3]?.replace(/\s+/g, ' ').trim() || '',
    });
  }
  return games;
}

function groupIntoSeries(maps) {
  const series = [];
  let i = 0;
  while (i < maps.length) {
    const cur = maps[i];
    const group = [cur];
    while (i + group.length < maps.length) {
      const next = maps[i + group.length];
      const days = Math.abs(new Date(cur._date) - new Date(next._date)) / 86400000;
      if (next._opp === cur._opp && days <= 2) group.push(next);
      else break;
    }
    const wins = group.filter(g => g.win).length;
    series.push({
      kills:   group.reduce((s, g) => s + g.kills,  0),
      deaths:  group.reduce((s, g) => s + g.deaths, 0),
      assists: 0,
      rating:  group[0].rating,
      win:     wins > group.length / 2,
      maps:    group.map(g => ({ kills: g.kills, deaths: g.deaths, assists: 0, map: g.map })),
      _date:   cur._date,
      _opp:    cur._opp,
    });
    i += group.length;
  }
  return series;
}

async function faceitFetch(path) {
  const r = await fetch(`${FACEIT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${FACEIT_KEY}` }
  });
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
      const q = (nickname || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const proMatches = Object.entries(HLTV_PROS)
        .filter(([key]) => key.includes(q) || q.includes(key))
        .sort((a, b) => (a[0] === q ? -1 : b[0] === q ? 1 : a[0].length - b[0].length))
        .slice(0, 6);

      if (proMatches.length) {
        return res.json({
          players: proMatches.map(([, p]) => ({
            id:   `hltv_${p.id}_${p.slug}`,
            name: p.display,
            sub:  'Pro · HLTV tournament data',
          }))
        });
      }

      // FACEIT fallback
      if (FACEIT_KEY) {
        const d = await faceitFetch(`/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=10`);
        const items = (d.items || [])
          .filter(p => parseInt(p.games?.cs2?.skill_level) === 10)
          .sort((a, b) => (parseInt(b.games?.cs2?.faceit_elo) || 0) - (parseInt(a.games?.cs2?.faceit_elo) || 0))
          .slice(0, 5);
        return res.json({
          players: items.map(p => ({
            id:   p.player_id,
            name: p.nickname,
            sub:  `Lvl ${p.games?.cs2?.skill_level} · ELO ${p.games?.cs2?.faceit_elo} · ${(p.country || '').toUpperCase()} · FACEIT only`,
          }))
        });
      }
      return res.json({ players: [] });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      if (playerId?.startsWith('hltv_')) {
        if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not configured in Vercel env vars' });

        const parts    = playerId.split('_');
        const hltvId   = parts[1];
        const hltvSlug = parts.slice(2).join('_');

        const end   = new Date().toISOString().split('T')[0];
        const start = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}&rankingFilter=Top30`;

        const html    = await scraperFetch(url);
        const rawMaps = parseMatchesTable(html);

        if (!rawMaps.length) {
          return res.status(404).json({
            error: `No match data found for ${hltvSlug}. HLTV page structure may have changed or player has no Top 30 matches in the last year.`
          });
        }

        const series = groupIntoSeries(rawMaps);
        return res.json({ games: series.slice(0, 40) });
      }

      // FACEIT fallback for non-pro players
      if (FACEIT_KEY) {
        const history = await faceitFetch(`/players/${playerId}/history?game=cs2&limit=20&offset=0`);
        const items   = (history.items || []).filter(m =>
          m.competition_type === 'championship' || m.competition_type === 'hub'
        );
        const games = (await Promise.all(items.slice(0, 15).map(async m => {
          try {
            const stats  = await faceitFetch(`/matches/${m.match_id}/stats`);
            const round  = stats.rounds?.[0];
            const team   = round?.teams?.find(t => t.players?.some(p => p.player_id === playerId));
            const player = team?.players?.find(p => p.player_id === playerId);
            if (!player) return null;
            return {
              kills:   parseInt(player.player_stats?.Kills || 0),
              deaths:  parseInt(player.player_stats?.Deaths || 0),
              assists: parseInt(player.player_stats?.Assists || 0),
              win:     team.team_stats?.['Team Win'] === '1',
              _date:   new Date(m.finished_at * 1000).toISOString().split('T')[0],
              _opp:    '',
            };
          } catch { return null; }
        }))).filter(Boolean);
        return res.json({ games });
      }

      return res.json({ games: [] });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
