export const config = { maxDuration: 30 };

const KEY  = process.env.RAPIDAPI_TENNIS_KEY;
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const BASE = `https://${HOST}`;

// ── Module-level cache (persists across warm invocations) ─────────────────────
// Pages are cached permanently — player IDs are stable, no expiry needed
const _pageCache   = {};  // `${tour}:${page}` → player[]
// Player lookups cached 24h
const _playerCache = {};  // normalized name → {id,name,tour,countryAcr,ts}
// Match data cached 4h
const _matchCache  = {};  // `${tour}:${id}` → {data:[],ts}

const PLAYER_TTL = 86_400_000;  // 24h
const MATCH_TTL  = 14_400_000;  //  4h

const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();

function H() {
  return { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST };
}

// Fetch one page of singles players for a tour (cached permanently after first fetch)
async function fetchPage(tour, page) {
  const key = `${tour}:${page}`;
  if (_pageCache[key]) return _pageCache[key];
  try {
    const r = await fetch(
      `${BASE}/tennis/v2/${tour}/player?pageSize=200&pageNo=${page}&filter=PlayerGroup:singles`,
      { headers: H(), signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    const d = await r.json().catch(() => []);
    const list = Array.isArray(d) ? d : (d?.data || []);
    // Cache non-empty pages forever — IDs don't change
    if (list.length) _pageCache[key] = list;
    return list;
  } catch { return []; }
}

// Scan player list pages to find a player by name.
// Pages are fetched in parallel batches of 5 and cached permanently after first fetch.
// The list is alphabetical by first name — we exit early once we've overshot.
async function findTennisPlayer(name) {
  const n = norm(name);

  // Fast path: cached lookup
  const hit = _playerCache[n];
  if (hit && Date.now() - hit.ts < PLAYER_TTL) return hit;

  const targetFirstChar = name.split(' ')[0].toLowerCase().charAt(0);
  const nameParts = n.split(' ').filter(Boolean);

  for (const tour of ['atp', 'wta']) {
    // Fetch 5 pages in parallel per batch — cached pages cost 0 API calls
    for (let bStart = 1; bStart <= 25; bStart += 5) {
      const pageNums = [bStart, bStart+1, bStart+2, bStart+3, bStart+4];
      const pages = await Promise.all(pageNums.map(p => fetchPage(tour, p)));

      let overshot = false;
      for (const players of pages) {
        if (!players.length) { overshot = true; break; }

        // Exact match
        let match = players.find(p => norm(p.name) === n);

        // All-parts match (handles "Carlos Alcaraz" → "Carlos Alcaraz Garfia")
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

        // Alphabetical overshoot: last player's first letter exceeds our target
        const lastFirstChar = (players[players.length - 1]?.name || '').toLowerCase().charAt(0);
        if (bStart > 5 && lastFirstChar > targetFirstChar) { overshot = true; break; }
      }
      if (overshot) break;
    }
  }

  return null;
}

// Parse a tennis score string into per-match stats for the queried player.
// Score format (player1 score always first per set): "6-2 7-6(4) 3-6"
// Returns null for walkovers/retirements with no complete match data.
function parseScore(result, isPlayer1) {
  if (!result || /w\/o|walkover/i.test(result)) return null;

  // Strip trailing retirement note — count only completed sets
  const clean = result.replace(/\s*\(ret\.\)/i, '').trim();
  const parts  = clean.split(/\s+/).filter(s => /^\d/.test(s));
  if (!parts.length) return null;

  let totalSets = 0, totalGames = 0, totalGamesWon = 0, totalTieBreaks = 0;

  for (const set of parts) {
    // Remove tiebreak score in parens: "7-6(4)" → "7-6"
    const bare = set.replace(/\(\d+\)$/, '');
    const [a, b] = bare.split('-').map(Number);
    if (isNaN(a) || isNaN(b)) continue;

    totalSets++;
    totalGames    += a + b;
    totalGamesWon += isPlayer1 ? a : b;
    // Tie break: exactly 7-6 in either direction
    if ((a === 7 && b === 6) || (a === 6 && b === 7)) totalTieBreaks++;
  }

  return totalSets ? { totalSets, totalGames, totalGamesWon, totalTieBreaks } : null;
}

// Fetch and cache past-matches for a player. Returns normalised match objects
// sorted most-recent-first (as the API delivers them).
async function getMatchLog(id, tour) {
  const cKey   = `${tour}:${id}`;
  const cached = _matchCache[cKey];
  if (cached && Date.now() - cached.ts < MATCH_TTL) return cached.data;

  try {
    const r = await fetch(
      `${BASE}/tennis/v2/${tour}/player/past-matches/${id}`,
      { headers: H(), signal: AbortSignal.timeout(10000) }
    );
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
        return {
          ...stats,
          won,
          result: m.result,
          _date:  (m.date || '').slice(0, 10),
        };
      })
      .filter(Boolean)
      .slice(0, 50);  // keep last 50 — more than enough for L30 + trending

    _matchCache[cKey] = { data: matches, ts: Date.now() };
    return matches;
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!KEY) return res.status(500).json({ error: 'RAPIDAPI_TENNIS_KEY env var not set' });

  const { action, q, id, tour } = req.query;

  try {
    // Search: find player ID + tour from a display name
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Missing q' });
      const player = await findTennisPlayer(q);
      if (!player) return res.status(404).json({ error: `Player not found: ${q}` });
      return res.json(player);
    }

    // Gamelog: return parsed match history for a known player
    if (action === 'gamelog') {
      if (!id || !tour) return res.status(400).json({ error: 'Missing id or tour' });
      const matches = await getMatchLog(id, tour);
      return res.json(matches);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
