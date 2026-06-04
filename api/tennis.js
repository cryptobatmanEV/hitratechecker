export const config = { maxDuration: 30 };

const CORE  = 'https://sports.core.api.espn.com/v2/sports/tennis';
const SITE  = 'https://site.api.espn.com/apis';
const UA    = 'Mozilla/5.0';

// Module-level cache — persists across warm invocations
const _playerCache = {};   // norm(name) → {id,name,league,ts}  24h
const _matchCache  = {};   // `${league}:${id}` → {data,ts}      24h
const CACHE_TTL    = 86_400_000;

const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();

async function get(url) {
  try {
    const r = await fetch(url.replace('http://', 'https://'), {
      headers: {'User-Agent': UA},
      signal:  AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  } catch { return null; }
}

// Fire all URLs in parallel — same pattern as NFL/NBA ESPN fetches
async function getAll(urls) {
  return Promise.all(urls.map(u => u ? get(u) : Promise.resolve(null)));
}

// ── Player search ─────────────────────────────────────────────────────────────
// Uses ESPN common search — same endpoint that powers ESPN.com search.
// Tries ATP first, then WTA. Returns {id, name, league}.
async function searchPlayer(name) {
  const n = norm(name);
  const hit = _playerCache[n];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit;

  for (const league of ['atp', 'wta']) {
    const d = await get(
      `${SITE}/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player&sport=tennis&league=${league}`
    );
    const items = d?.items || [];
    const match = items.find(p => norm(p.displayName) === n)
      || items.find(p => norm(p.displayName).includes(n.split(' ').pop()))
      || items[0];
    if (match?.id) {
      const result = { id: String(match.id), name: match.displayName, league };
      _playerCache[n] = { ...result, ts: Date.now() };
      return result;
    }
  }
  return null;
}

// ── Game log ──────────────────────────────────────────────────────────────────
// Fetches current + previous season eventlog, then resolves each match's
// linescore in two parallel rounds:
//   Round 1 — all competition refs in parallel
//   Round 2 — all linescore refs (player + opponent) in parallel
// Net result: ~2 × ~500ms = ~1s for a full 30-match history.
async function getGamelog(id, league) {
  const cKey = `${league}:${id}`;
  const hit  = _matchCache[cKey];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const year = new Date().getFullYear();

  // Two seasons in parallel
  const [log1, log2] = await getAll([
    `${CORE}/leagues/${league}/seasons/${year}/athletes/${id}/eventlog?limit=30`,
    `${CORE}/leagues/${league}/seasons/${year - 1}/athletes/${id}/eventlog?limit=30`,
  ]);

  const items = [
    ...(log1?.events?.items || []),
    ...(log2?.events?.items || []),
  ].filter(i => i?.played && i?.competition?.$ref).slice(0, 30);

  if (!items.length) return [];

  // Round 1: all competition objects in parallel
  const comps = await getAll(items.map(i => i.competition.$ref));

  // Collect player + opponent linescore refs for every match
  const lsRefs = comps.map(comp => {
    if (!comp) return [null, null];
    const me  = comp.competitors?.find(c => String(c.id) === String(id));
    const opp = comp.competitors?.find(c => String(c.id) !== String(id));
    return [me?.linescores?.$ref || null, opp?.linescores?.$ref || null];
  });

  // Round 2: all linescores in parallel (2 per match)
  const allLS = await getAll(lsRefs.flat());

  // Build normalised match records
  const matches = comps.map((comp, i) => {
    if (!comp) return null;
    const me      = comp.competitors?.find(c => String(c.id) === String(id));
    const playerLS = allLS[i * 2];
    const oppLS    = allLS[i * 2 + 1];
    if (!playerLS?.items?.length) return null;

    const pSets = playerLS.items;
    const oSets = oppLS?.items || [];
    let totalGames = 0, totalGamesWon = 0, totalTieBreaks = 0;

    for (let s = 0; s < pSets.length; s++) {
      const pg = pSets[s]?.value ?? 0;
      const og = oSets[s]?.value ?? 0;
      totalGames    += pg + og;
      totalGamesWon += pg;
      if ((pg === 7 && og === 6) || (pg === 6 && og === 7)) totalTieBreaks++;
    }

    return {
      totalSets:      pSets.length,
      totalGames,
      totalGamesWon,
      totalTieBreaks,
      won:   me?.winner === true,
      _date: (comp.date || '').slice(0, 10),
    };
  }).filter(Boolean);

  _matchCache[cKey] = { data: matches, ts: Date.now() };
  return matches;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, q, id } = req.query;
  // Accept both 'league' and 'tour' for backwards compat with HTML + trending
  const league = req.query.league || req.query.tour || 'atp';

  try {
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Missing q' });
      const player = await searchPlayer(q);
      if (!player) return res.status(404).json({ error: `Player not found: ${q}` });
      return res.json(player);
    }

    if (action === 'gamelog') {
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const matches = await getGamelog(id, league);
      return res.json(matches);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
