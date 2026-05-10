const FACEIT_KEY  = process.env.FACEIT_API_KEY;
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';

const gameCache = new Map();

const PRO_SLUGS = [
  'NiKo','ZywOo','device','s1mple','m0NESY','rain','ropz','broky','karrigan',
  'frozen','blameF','torzsi','xertioN','nicoodoz','TeSeS','sjuush','jabbi',
  'dupreeh','Magisk','KRIMZ','hampus','headtr1ck','apEX','mezii','Spinx','flameZ',
  'electronic','b1t','Perfecto','iM','jL','sh1ro','Ax1Le','HObbit','Jame',
  'degster','sdy','Twistzz','NAF','EliGE','Grim','floppy','brehze','YEKINDAR',
  'story','Sonic','hallzerk','k0nfig','XANTARES','woxic','FalleN','KSCERATO',
  'yuurih','dgt','chelo','arT','meyern','luchov','jks','huNter-','HooXi',
  'MalbsMd','skullz','Staehr','roeJ','Lucky','CerQ','Stewie2K','autimatic',
];

function findSlugMatch(query) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRO_SLUGS
    .filter(s => {
      const sn = s.toLowerCase().replace(/[^a-z0-9]/g, '');
      return sn.includes(q) || q.includes(sn);
    })
    .sort((a, b) => {
      const an = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      const bn = b.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (an === q) return -1;
      if (bn === q) return 1;
      return Math.abs(an.length - q.length) - Math.abs(bn.length - q.length);
    })
    .slice(0, 6);
}

async function scraperFetch(url, js = false) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}${js ? '&render=true' : ''}`,
    { headers: { Accept: 'text/html' } }
  );
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

async function hltvSearch(query) {
  const html = await scraperFetch(`https://www.hltv.org/search?query=${encodeURIComponent(query)}`, true);
  const results = [];
  const rx = /href="\/player\/(\d+)\/([^"?#]+)"/gi;
  let m;
  const seen = new Set();
  while ((m = rx.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      results.push({ id: m[1], slug: m[2], display: m[2] });
    }
  }
  return results.slice(0, 6);
}

// Parse HLTV stats/players/matches page
// Confirmed structure (7 cells per row):
// 0:date  1:playerTeam(score)  2:opponent(score)  3:map  4:"K - D"  5:+/-  6:rating
// K and D are combined in one cell as "15 - 14"
// T1/T2 headers are CSS-only mobile labels sharing cells with playerTeam/opponent
function parseHLTVMatches(html) {
  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tMatch) return { games: [], debug: 'stats-matches-table not found' };
  const tHTML = tMatch[1];

  // Read headers for debug/verification
  const headers = [];
  const hRx = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  let hm;
  while ((hm = hRx.exec(tHTML)) !== null)
    headers.push(hm[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase());

  // Detect K-D column index dynamically (usually index 4, but verify)
  // Build a stripped-headers list that only counts columns that have real cells
  // We know: date, playerTeam, opponent, map, K-D, +/-, rating = 7 cells
  // Find which stripped-header index has "k" pattern
  const strippedHeaders = headers.filter(h => !h.startsWith('t') || h === 'team');
  let kdIdx = strippedHeaders.findIndex(h => h.includes('k') && h.includes('d') && h.includes('-'));
  if (kdIdx === -1) kdIdx = 4; // fallback

  const games = [];
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowM;
  while ((rowM = rowRx.exec(tHTML)) !== null) {
    const rowHTML = rowM[1];
    if (/<th/i.test(rowHTML)) continue;

    const cells = [];
    const cRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cm;
    while ((cm = cRx.exec(rowHTML)) !== null)
      cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim());

    if (cells.length < 5) continue;

    // Parse K-D from combined cell e.g. "15 - 14"
    const kdMatch = (cells[kdIdx] || '').match(/(\d+)\s*-\s*(\d+)/);
    if (!kdMatch) continue;
    const kills  = parseInt(kdMatch[1]);
    const deaths = parseInt(kdMatch[2]);
    if (isNaN(kills) || kills < 0 || isNaN(deaths) || deaths < 0) continue;

    // Win: compare round scores in parentheses e.g. "FlyQuest (8)" vs "TYLOO (13)"
    const myScore  = parseInt((cells[1] || '').match(/\((\d+)\)/)?.[1]);
    const oppScore = parseInt((cells[2] || '').match(/\((\d+)\)/)?.[1]);
    const win = (!isNaN(myScore) && !isNaN(oppScore)) ? myScore > oppScore : null;

    // Clean team name (strip score)
    const opp = (cells[2] || '').replace(/\(\d+\)/, '').trim();

    games.push({
      kills, deaths, assists: 0, win,
      map:   cells[3] || '',
      _date: cells[0] || '',
      _opp:  opp,
    });
  }
  return { games, headers };
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

async function resolveHLTVPlayer(slug) {
  const results = await hltvSearch(slug);
  if (!results.length) throw new Error(`"${slug}" not found on HLTV`);
  return results[0];
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

      const slugMatches = findSlugMatch(nickname || '');
      if (slugMatches.length) {
        return res.json({
          players: slugMatches.map(slug => ({
            id:   `hltv_search_${slug}`,
            name: slug,
            sub:  'Pro · HLTV tournament data',
          }))
        });
      }

      try {
        const results = await hltvSearch(nickname);
        if (results.length) return res.json({
          players: results.map(p => ({
            id:   `hltv_${p.id}_${p.slug}`,
            name: p.display,
            sub:  'Pro · HLTV tournament data',
          }))
        });
      } catch(e) {}

      if (FACEIT_KEY) {
        const d     = await faceitFetch(`/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=10`);
        const items = (d.items || [])
          .filter(p => parseInt(p.games?.cs2?.skill_level) === 10)
          .sort((a, b) => (parseInt(b.games?.cs2?.faceit_elo) || 0) - (parseInt(a.games?.cs2?.faceit_elo) || 0))
          .slice(0, 5);
        if (items.length) return res.json({
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
      if (gameCache.has(playerId)) return res.json({ games: gameCache.get(playerId), cached: true });

      if (playerId?.startsWith('hltv_')) {
        if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });

        let hltvId, hltvSlug;
        if (playerId.startsWith('hltv_search_')) {
          const slug   = playerId.replace('hltv_search_', '');
          const player = await resolveHLTVPlayer(slug);
          hltvId   = player.id;
          hltvSlug = player.slug;
        } else {
          const parts = playerId.split('_');
          hltvId   = parts[1];
          hltvSlug = parts.slice(2).join('_');
        }

        const end   = new Date().toISOString().split('T')[0];
        const start = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;
        const html  = await scraperFetch(url, false);

        // Detect wrong player and self-correct
        const urlSlugInPage = html.match(/\/stats\/players\/matches\/\d+\/([^"?]+)\?sortColumn/)?.[1];
        if (urlSlugInPage && urlSlugInPage.toLowerCase() !== hltvSlug.toLowerCase()) {
          const fixed   = await resolveHLTVPlayer(hltvSlug);
          hltvId        = fixed.id;
          hltvSlug      = fixed.slug;
          const html2   = await scraperFetch(`https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`, false);
          const { games: rawMaps } = parseHLTVMatches(html2);
          const games = groupIntoSeries(rawMaps).slice(0, 40);
          gameCache.set(playerId, games);
          return res.json({ games });
        }

        const { games: rawMaps, debug } = parseHLTVMatches(html);
        if (!rawMaps.length) return res.status(404).json({ error: `No match data found. Run debug: /api/cs2?action=debug&playerId=${playerId}`, debug });

        const games = groupIntoSeries(rawMaps).slice(0, 40);
        gameCache.set(playerId, games);
        return res.json({ games });
      }

      // FACEIT fallback
      if (FACEIT_KEY) {
        const history = await faceitFetch(`/players/${playerId}/history?game=cs2&limit=20&offset=0`);
        const items   = (history.items || []).filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');
        const games = (await Promise.all(items.slice(0, 15).map(async m => {
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
        gameCache.set(playerId, games);
        return res.json({ games });
      }
      return res.json({ games: [] });
    }

    // ── Debug ────────────────────────────────────────────────────────────────
    if (action === 'debug') {
      if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });

      const isSearch = playerId?.startsWith('hltv_search_');
      let hltvId, hltvSlug;
      if (isSearch) {
        const slug   = (playerId || '').replace('hltv_search_', '');
        const player = await resolveHLTVPlayer(slug);
        hltvId   = player.id;
        hltvSlug = player.slug;
      } else {
        const parts = (playerId || 'hltv_9816_NiKo').split('_');
        hltvId   = parts[1];
        hltvSlug = parts.slice(2).join('_');
      }

      const end   = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
      const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;
      const html  = await scraperFetch(url, false);
      const { games, headers, indices, debug } = parseHLTVMatches(html);

      // First data row raw cells for inspection
      const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
      let firstRowCells = [];
      if (tMatch) {
        const rowM = /<tr[^>]*>([\s\S]*?)<\/tr>/gi.exec(tMatch[1].replace(/<thead[\s\S]*?<\/thead>/i, ''));
        if (rowM) {
          const cRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cm;
          while ((cm = cRx.exec(rowM[1])) !== null)
            firstRowCells.push(cm[1].replace(/<[^>]+>/g, '').trim().slice(0, 30));
        }
      }

      return res.json({
        url, resolvedId: hltvId, resolvedSlug: hltvSlug,
        htmlLength: html.length,
        gamesFound: games.length,
        headers,
        indices,
        firstRowCells,
        first3Games: games.slice(0, 3),
        debugMsg: debug,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
