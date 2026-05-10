const FACEIT_KEY  = process.env.FACEIT_API_KEY;
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';

async function scraperFetch(url) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html,application/xhtml+xml' } }
  );
  if (!r.ok) throw new Error(`ScraperAPI ${r.status} for ${url}`);
  return r.text();
}

// Search HLTV for a player — returns [{id, slug, name, team}]
async function searchHLTV(query) {
  const html = await scraperFetch(`https://www.hltv.org/search?query=${encodeURIComponent(query)}`);
  const players = [];
  // Player links look like: href="/player/9816/NiKo"
  const rx = /href="\/player\/(\d+)\/([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const name = m[3].trim() || m[2];
    if (!name || name.length < 1) continue;
    players.push({ id: m[1], slug: m[2], display: name });
  }
  // Deduplicate by id
  const seen = new Set();
  return players.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).slice(0, 8);
}

// Parse HLTV player matches table
// Columns: Date | Event | Map | Opponent | Result | K | D | +/- | Rating
function parseMatchesTable(html) {
  const games = [];

  // Find all stats tables
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableM;
  while ((tableM = tableRx.exec(html)) !== null) {
    const tableHTML = tableM[1];

    // Check if this table has K/D columns (the right table)
    if (!/>\s*K\s*</.test(tableHTML) && !/>\s*Kills\s*</.test(tableHTML)) continue;

    // Get column order from header row
    const headerRx = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers = [];
    let hm;
    while ((hm = headerRx.exec(tableHTML)) !== null) {
      headers.push(hm[1].replace(/<[^>]+>/g, '').trim().toLowerCase());
    }

    const kIdx   = headers.findIndex(h => h === 'k' || h === 'kills');
    const dIdx   = headers.findIndex(h => h === 'd' || h === 'deaths');
    const dateIdx = headers.findIndex(h => h === 'date');
    const mapIdx  = headers.findIndex(h => h === 'map');
    const oppIdx  = headers.findIndex(h => h === 'opponent' || h === 'opp');
    const resIdx  = headers.findIndex(h => h === 'result' || h === 'res');

    if (kIdx === -1 || dIdx === -1) continue;

    // Parse data rows
    const rowRx = /<tr[^>]*class="[^"]*(?:even|odd)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowM;
    while ((rowM = rowRx.exec(tableHTML)) !== null) {
      const cells = [];
      const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellM;
      while ((cellM = cellRx.exec(rowM[1])) !== null) {
        cells.push(cellM[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
      }
      if (cells.length <= Math.max(kIdx, dIdx)) continue;

      const kills  = parseInt(cells[kIdx]);
      const deaths = parseInt(cells[dIdx]);
      if (isNaN(kills) || kills < 0 || isNaN(deaths) || deaths < 0) continue;

      games.push({
        kills,
        deaths,
        assists: 0,
        win:    resIdx >= 0 ? (cells[resIdx] || '').toLowerCase().startsWith('w') : null,
        map:    mapIdx >= 0 ? cells[mapIdx] || '' : '',
        _date:  dateIdx >= 0 ? cells[dateIdx] || '' : '',
        _opp:   oppIdx >= 0 ? cells[oppIdx] || '' : '',
      });
    }
    if (games.length) break; // found the right table
  }
  return games;
}

function groupIntoSeries(maps) {
  const series = [];
  let i = 0;
  while (i < maps.length) {
    const cur   = maps[i];
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
      if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set in Vercel env vars' });

      const hltvPlayers = await searchHLTV(nickname);
      if (hltvPlayers.length) {
        return res.json({
          players: hltvPlayers.map(p => ({
            id:   `hltv_${p.id}_${p.slug}`,
            name: p.display,
            sub:  'HLTV · Pro tournament data',
          }))
        });
      }

      // Fallback: FACEIT
      if (FACEIT_KEY) {
        const d     = await faceitFetch(`/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=10`);
        const items = (d.items || [])
          .filter(p => parseInt(p.games?.cs2?.skill_level) === 10)
          .sort((a, b) => (parseInt(b.games?.cs2?.faceit_elo) || 0) - (parseInt(a.games?.cs2?.faceit_elo) || 0))
          .slice(0, 5);
        return res.json({
          players: items.map(p => ({
            id:   p.player_id,
            name: p.nickname,
            sub:  `Lvl ${p.games?.cs2?.skill_level} · ELO ${p.games?.cs2?.faceit_elo} · FACEIT only`,
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

        const end   = new Date().toISOString().split('T')[0];
        const start = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;

        const html    = await scraperFetch(url);
        const rawMaps = parseMatchesTable(html);

        if (!rawMaps.length) {
          // Return snippet for debugging
          return res.status(404).json({
            error: `No match data parsed for ${hltvSlug}. Check /api/cs2?action=debug&playerId=${playerId} to inspect HTML.`,
            htmlLength: html.length,
            htmlSnippet: html.slice(0, 500),
          });
        }

        const series = groupIntoSeries(rawMaps);
        return res.json({ games: series.slice(0, 40) });
      }

      // FACEIT fallback
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
              maps:    [],
            };
          } catch { return null; }
        }))).filter(Boolean);
        return res.json({ games });
      }

      return res.json({ games: [] });
    }

    // ── Debug — returns raw HTML snippet for parser troubleshooting ──────────
    if (action === 'debug') {
      if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });
      const parts    = (playerId || '').split('_');
      const hltvId   = parts[1] || '9816';
      const hltvSlug = parts.slice(2).join('_') || 'NiKo';
      const end   = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
      const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;
      const html  = await scraperFetch(url);
      const rawMaps = parseMatchesTable(html);
      return res.json({
        url,
        htmlLength: html.length,
        tablesFound: (html.match(/<table/gi) || []).length,
        rawMapsFound: rawMaps.length,
        first3Maps: rawMaps.slice(0, 3),
        htmlTableSnippet: (html.match(/<table[\s\S]*?<\/table>/i) || ['not found'])[0].slice(0, 1000),
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
