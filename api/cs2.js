const FACEIT_KEY  = process.env.FACEIT_API_KEY;
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';

// In-memory cache — reused across requests in same Vercel container (saves credits)
const gameCache = new Map();

// Curated DFS pro list — names only, IDs resolved dynamically via HLTV
const PRO_SLUGS = [
  'NiKo','ZywOo','device','s1mple','m0NESY','rain','ropz','broky','karrigan',
  'frozen','blameF','torzsi','xertioN','nicoodoz','TeSeS','sjuush','jabbi',
  'dupreeh','Magisk','KRIMZ','hampus','headtr1ck','apEX','mezii','Spinx','flameZ',
  'electronic','b1t','Perfecto','iM','jL','sh1ro','Ax1Le','HObbit','Jame',
  'degster','sdy','Twistzz','NAF','EliGE','Grim','floppy','brehze','YEKINDAR',
  'story','Sonic','hallzerk','k0nfig','XANTARES','woxic','FalleN','KSCERATO',
  'yuurih','dgt','chelo','arT','meyern','luchov','jks','huNter-','HooXi',
  'MalbsMd','skullz','Staehr','roeJ','Lucky','ropz','CerQ','Stewie2K',
];

function findSlugMatch(query) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRO_SLUGS
    .filter(s => s.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q) ||
                 q.includes(s.toLowerCase().replace(/[^a-z0-9]/g, '')))
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
  const params = `api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}${js ? '&render=true' : ''}`;
  const r = await fetch(`https://api.scraperapi.com?${params}`, {
    headers: { Accept: 'text/html' }
  });
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

// Search HLTV with JS rendering — returns {id, slug, display}
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

// Parse HLTV stats/players/matches page using CSS class names (reliable)
function parseHLTVMatches(html) {
  const games = [];
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowM;
  while ((rowM = rowRx.exec(html)) !== null) {
    const row = rowM[1];
    if (/<th/i.test(row)) continue;

    // Use HLTV's specific class names — immune to column reordering
    const kMatch   = row.match(/class="[^"]*statsPlayerMatchesKills[^"]*"[^>]*>\s*(\d+)\s*<\/td>/);
    const dMatch   = row.match(/class="[^"]*statsPlayerMatchesDeaths[^"]*"[^>]*>\s*(\d+)\s*<\/td>/);
    if (!kMatch || !dMatch) continue;

    const kills  = parseInt(kMatch[1]);
    const deaths = parseInt(dMatch[1]);
    if (isNaN(kills) || isNaN(deaths) || kills < 0 || deaths < 0) continue;

    // Date — look for yyyy-mm-dd or text date inside the date cell
    const dateM = row.match(/class="[^"]*statsPlayerMatchesDate[^"]*"[\s\S]*?>([\s\S]*?)<\/td>/);
    const dateRaw = dateM ? dateM[1].replace(/<[^>]+>/g, '').trim() : '';

    // Map name
    const mapM = row.match(/class="[^"]*statsPlayerMatchesMap[^"]*"[\s\S]*?>([\s\S]*?)<\/td>/);
    const map  = mapM ? mapM[1].replace(/<[^>]+>/g, '').trim() : '';

    // Opponent — gtSmartphone version (full name)
    const oppM = row.match(/class="[^"]*statsPlayerMatchesTeam2[^"]*gtSmartphone[^"]*"[\s\S]*?>([\s\S]*?)<\/td>/);
    const opp  = oppM ? oppM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

    // Result
    const resM = row.match(/class="[^"]*statsPlayerMatchesResult[^"]*"[\s\S]*?>([\s\S]*?)<\/td>/);
    const res  = resM ? resM[1].replace(/<[^>]+>/g, '').trim() : '';

    games.push({
      kills, deaths, assists: 0,
      win:   res ? res.toLowerCase().startsWith('w') : null,
      map,
      _date: dateRaw,
      _opp:  opp,
    });
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
      if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });

      // 1. Fast match against curated slug list
      const slugMatches = findSlugMatch(nickname || '');
      if (slugMatches.length) {
        return res.json({
          players: slugMatches.map(slug => ({
            id:   `hltv_search_${slug}`,   // ID resolved at gamelog time
            name: slug,
            sub:  'Pro · HLTV tournament data',
          }))
        });
      }

      // 2. JS-rendered HLTV search (5 credits)
      try {
        const results = await hltvSearch(nickname);
        if (results.length) {
          return res.json({
            players: results.map(p => ({
              id:   `hltv_${p.id}_${p.slug}`,
              name: p.display,
              sub:  'Pro · HLTV tournament data',
            }))
          });
        }
      } catch(e) { /* fall through */ }

      // 3. FACEIT L10 fallback
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
      // Check cache first
      if (gameCache.has(playerId)) {
        return res.json({ games: gameCache.get(playerId), cached: true });
      }

      if (playerId?.startsWith('hltv_')) {
        if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });

        let hltvId, hltvSlug;

        // hltv_search_{slug} — need to resolve real ID via JS search (5 credits)
        if (playerId.startsWith('hltv_search_')) {
          const searchSlug = playerId.replace('hltv_search_', '');
          const results    = await hltvSearch(searchSlug);
          if (!results.length) return res.status(404).json({ error: `Player "${searchSlug}" not found on HLTV` });
          hltvId   = results[0].id;
          hltvSlug = results[0].slug;
        } else {
          // hltv_{id}_{slug} — use directly
          const parts = playerId.split('_');
          hltvId   = parts[1];
          hltvSlug = parts.slice(2).join('_');
        }

        const end   = new Date().toISOString().split('T')[0];
        const start = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;

        const html = await scraperFetch(url, false); // SSR — 1 credit

        // Detect wrong player (HLTV silently serves different player for wrong ID)
        const wrongSlug = html.match(/\/player\/\d+\/([^"?/]+)\?sortColumn/)?.[1];
        if (wrongSlug && wrongSlug.toLowerCase() !== hltvSlug.toLowerCase()) {
          // Self-correct: search for the right player
          const fixed = await hltvSearch(hltvSlug);
          if (fixed.length) {
            hltvId   = fixed[0].id;
            hltvSlug = fixed[0].slug;
            const fixedHtml = await scraperFetch(
              `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`,
              false
            );
            const rawMaps = parseHLTVMatches(fixedHtml);
            const games   = groupIntoSeries(rawMaps).slice(0, 40);
            gameCache.set(playerId, games);
            return res.json({ games, resolvedAs: `${hltvId}/${hltvSlug}` });
          }
        }

        const rawMaps = parseHLTVMatches(html);
        if (!rawMaps.length) {
          return res.status(404).json({
            error: `No match data found. Debug: /api/cs2?action=debug&playerId=${playerId}`,
            htmlLength: html.length,
          });
        }

        const games = groupIntoSeries(rawMaps).slice(0, 40);
        gameCache.set(playerId, games);
        return res.json({ games });
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
              _opp:    '', maps: [],
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
      const parts    = (playerId || 'hltv_search_NiKo').split('_');
      const isSearch = playerId?.startsWith('hltv_search_');
      let hltvId     = isSearch ? null : parts[1];
      let hltvSlug   = isSearch ? parts.slice(2).join('_') : parts.slice(2).join('_');

      if (isSearch) {
        const results = await hltvSearch(hltvSlug);
        if (!results.length) return res.json({ error: 'Not found on HLTV', query: hltvSlug });
        hltvId   = results[0].id;
        hltvSlug = results[0].slug;
      }

      const end   = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];
      const url   = `https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;
      const html  = await scraperFetch(url, false);
      const games = parseHLTVMatches(html);

      return res.json({
        url,
        resolvedId:   hltvId,
        resolvedSlug: hltvSlug,
        htmlLength:   html.length,
        gamesFound:   games.length,
        first5:       games.slice(0, 5),
        classesFound: {
          kills:  (html.match(/statsPlayerMatchesKills/g) || []).length,
          deaths: (html.match(/statsPlayerMatchesDeaths/g) || []).length,
          date:   (html.match(/statsPlayerMatchesDate/g) || []).length,
        },
        // Sample raw snippet around kills class
        killsSnippet: (html.match(/statsPlayerMatchesKills[^<]*<\/td>/)?.[0] || 'not found'),
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
