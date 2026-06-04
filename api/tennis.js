export const config = { maxDuration: 30 };

const KEY  = process.env.RAPIDAPI_TENNIS_KEY;
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const BASE = `https://${HOST}`;

// ── Module-level cache ────────────────────────────────────────────────────────
const _pageCache   = {};  // `${tour}:${page}` → player[]  (permanent — IDs don't change)
const _playerCache = {};  // normalized name → {id,name,tour,countryAcr,ts}  (24h)
const _matchCache  = {};  // `${tour}:${id}` → {data:[],ts}  (24h — historical data never changes)

const PLAYER_TTL = 86_400_000;   // 24h
const MATCH_TTL  = 86_400_000;   // 24h

const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function H() {
  return { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST };
}

// Fetch one page — returns [] on any error, throws {rateLimited:true} on 429
async function fetchPage(tour, page) {
  const key = `${tour}:${page}`;
  if (_pageCache[key]) return _pageCache[key];

  try {
    const r = await fetch(
      `${BASE}/tennis/v2/${tour}/player?pageSize=200&pageNo=${page}&filter=PlayerGroup:singles`,
      { headers: H(), signal: AbortSignal.timeout(8000) }
    );
    if (r.status === 429) throw { rateLimited: true };
    if (!r.ok) return [];
    const d = await r.json().catch(() => ({}));
    const list = Array.isArray(d) ? d : (d?.data || []);
    if (list.length) _pageCache[key] = list;
    return list;
  } catch (e) {
    if (e.rateLimited) throw e;   // propagate 429 up
    return [];
  }
}

// Sequential page scan — one page at a time with a small delay to stay within
// burst rate limits. Pages are cached permanently so each page costs at most
// one API call ever (zero on cache hits).
async function findTennisPlayer(name) {
  const n = norm(name);

  const hit = _playerCache[n];
  if (hit && Date.now() - hit.ts < PLAYER_TTL) return hit;

  const targetFirstChar = name.split(' ')[0].toLowerCase().charAt(0);
  const nameParts = n.split(' ').filter(Boolean);

  for (const tour of ['atp', 'wta']) {
    for (let page = 1; page <= 20; page++) {
      // Only delay on actual API calls (cache hits return instantly)
      const isCached = !!_pageCache[`${tour}:${page}`];
      if (!isCached && page > 1) await sleep(150);   // 150ms between real API calls

      const players = await fetchPage(tour, page);   // throws on 429
      if (!players.length) break;                     // end of list

      // Exact match
      let match = players.find(p => norm(p.name) === n);

      // All-parts match — handles "Carlos Alcaraz Garfia" for query "Carlos Alcaraz"
      if (!match && nameParts.length > 1) {
        match = players.find(p => {
          const pn = norm(p.name);
          return nameParts.every(pt => pn.includes(pt));
        });
      }

      if (match) {
        const result = { id: match.id, name: match.name, tour, countryAcr: match.countryAcr || null };
        _playerCache[n] = { ...result, ts: Date.now() };
        return result;
      }

      // Alphabetical overshoot — stop scanning this tour early
      const lastFirstChar = (players[players.length - 1]?.name || '').toLowerCase().charAt(0);
      if (page >= 3 && lastFirstChar > targetFirstChar) break;
    }
  }

  return null;
}

// Parse score string into per-match stats for the queried player.
// The API always lists player1's score first in each set: "6-2 7-6(4) 3-6"
function parseScore(result, isPlayer1) {
  if (!result || /w\/o|walkover/i.test(result)) return null;
  const clean    = result.replace(/\s*\(ret\.\)/i, '').trim();
  const setParts = clean.split(/\s+/).filter(s => /^\d/.test(s));
  if (!setParts.length) return null;

  let totalSets = 0, totalGames = 0, totalGamesWon = 0, totalTieBreaks = 0;
  for (const set of setParts) {
    const bare = set.replace(/\(\d+\)$/, '');
    const [a, b] = bare.split('-').map(Number);
    if (isNaN(a) || isNaN(b)) continue;
    totalSets++;
    totalGames    += a + b;
    totalGamesWon += isPlayer1 ? a : b;
    if ((a === 7 && b === 6) || (a === 6 && b === 7)) totalTieBreaks++;
  }
  return totalSets ? { totalSets, totalGames, totalGamesWon, totalTieBreaks } : null;
}

// Fetch and cache past-matches for a player
async function getMatchLog(id, tour) {
  const cKey   = `${tour}:${id}`;
  const cached = _matchCache[cKey];
  if (cached && Date.now() - cached.ts < MATCH_TTL) return cached.data;

  const r = await fetch(
    `${BASE}/tennis/v2/${tour}/player/past-matches/${id}`,
    { headers: H(), signal: AbortSignal.timeout(10000) }
  );
  if (r.status === 429) throw { rateLimited: true };
  if (!r.ok) return [];

  const d   = await r.json().catch(() => null);
  const raw = Array.isArray(d) ? d : (d?.data || []);

  const matches = raw
    .map(m => {
      if (!m.result || !/\d/.test(m.result)) return null;
      const isP1  = String(m.player1Id) === String(id);
      const won   = String(m.match_winner) === String(id);
      const stats = parseScore(m.result, isP1);
      if (!stats) return null;
      return { ...stats, won, result: m.result, _date: (m.date || '').slice(0, 10) };
    })
    .filter(Boolean)
    .slice(0, 50);

  _matchCache[cKey] = { data: matches, ts: Date.now() };
  return matches;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!KEY) return res.status(500).json({ error: 'RAPIDAPI_TENNIS_KEY env var not set' });

  const { action, q, id, tour } = req.query;

  try {
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Missing q' });
      const player = await findTennisPlayer(q);
      if (!player) return res.status(404).json({ error: `Player not found: ${q}` });
      return res.json(player);
    }

    if (action === 'gamelog') {
      if (!id || !tour) return res.status(400).json({ error: 'Missing id or tour' });
      const matches = await getMatchLog(id, tour);
      return res.json(matches);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (e) {
    if (e.rateLimited) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Tennis API daily limit reached. Resets at midnight UTC.'
      });
    }
    return res.status(500).json({ error: e.message });
  }
}
