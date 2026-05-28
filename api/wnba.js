export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function espnGet(url) {
  // ESPN Core API uses http:// in $refs — upgrade to https
  const r = await fetch(url.replace('http://', 'https://'), {
    headers: { 'User-Agent': UA }
  });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

// Parse stats categories into flat object
function extractStats(categories = []) {
  const m = {};
  for (const cat of categories) {
    for (const s of cat.stats || []) {
      m[s.name] = parseFloat(s.value) ?? 0;
    }
  }
  return {
    pts:  m.points                    ?? 0,
    reb:  m.rebounds                  ?? 0,
    ast:  m.assists                   ?? 0,
    stl:  m.steals                    ?? 0,
    blk:  m.blocks                    ?? 0,
    fg3m: m.threePointFieldGoalsMade  ?? 0,
    tov:  m.turnovers                 ?? 0,
    min:  m.minutes                   ?? 0,
  };
}

// Fetch all pages of a player's eventlog for a season
async function fetchEventlogItems(athleteId, season) {
  const items = [];
  let page = 1;
  while (true) {
    const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${season}/athletes/${athleteId}/eventlog?limit=25&page=${page}`;
    const data = await espnGet(url);
    const pageItems = (data.events?.items || []).filter(i => i.played);
    items.push(...pageItems);
    if (page >= (data.events?.pageCount || 1)) break;
    page++;
  }
  return items;
}

// Resolve competition: get date, opponent name, W/L
async function resolveCompetition(compRef, teamId) {
  try {
    const comp = await espnGet(compRef);
    const date = (comp.date || '').slice(0, 10);
    const competitors = comp.competitors || [];

    const us  = competitors.find(c => String(c.id) === String(teamId));
    const opp = competitors.find(c => String(c.id) !== String(teamId));

    // Scores may be inline {value} or $ref
    const getScore = async (c) => {
      if (!c) return 0;
      if (c.score?.value !== undefined) return parseFloat(c.score.value) || 0;
      if (c.score?.$ref) {
        try { const s = await espnGet(c.score.$ref); return parseFloat(s.value) || 0; } catch {}
      }
      return 0;
    };

    // Team name may be inline or $ref
    let oppName = '';
    if (opp?.team?.$ref) {
      try { const t = await espnGet(opp.team.$ref); oppName = t.displayName || t.name || ''; } catch {}
    } else if (opp?.team?.displayName) {
      oppName = opp.team.displayName;
    }

    const [ourScore, oppScore] = await Promise.all([getScore(us), getScore(opp)]);
    return { date, _opp: oppName, win: ourScore > oppScore };
  } catch {
    return { date: '', _opp: '', win: false };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { action, q, id, scope } = req.query;

  try {
    // ── Search ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      if (!q) return res.json([]);
      const data = await espnGet(
        `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&type=player&sport=basketball&league=wnba`
      );
      const results = (data.items || [])
        .filter(p => p.isActive && !p.isRetired)
        .slice(0, 8)
        .map(p => ({
          id:   p.id,
          name: p.displayName,
          sub:  p.teamRelationships?.[0]?.displayName || 'WNBA',
        }));
      return res.json(results);
    }

    // ── Gamelog ───────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      if (!id) return res.json([]);

      const year = new Date().getFullYear();
      const season = scope === 'career' ? year - 1 : year;

      const items = await fetchEventlogItems(id, season);

      // Parallel fetch stats + competition for each game
      const games = await Promise.all(items.map(async item => {
        try {
          const [statsData, compInfo] = await Promise.all([
            espnGet(item.statistics.$ref),
            resolveCompetition(item.competition.$ref, item.teamId),
          ]);
          const stats = extractStats(statsData.splits?.categories);
          return { ...stats, ...compInfo };
        } catch { return null; }
      }));

      return res.json(games.filter(Boolean).reverse()); // newest first
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
