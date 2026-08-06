export const config = { maxDuration: 30 };

const UA = 'curl/8.7.1';

async function espnGet(url) {
  const r = await fetch(url.replace('http://', 'https://'), {
    headers: { 'User-Agent': UA }
  });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

// Fetch WNBA team ID → name from ESPN dynamically (covers all teams inc. expansion)
async function fetchTeamMap() {
  try {
    const data = await espnGet('https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams');
    const map = {};
    for (const sport of data.sports || []) {
      for (const league of sport.leagues || []) {
        for (const entry of league.teams || []) {
          const t = entry.team;
          if (t?.id) map[String(t.id)] = t.displayName || t.name || '';
        }
      }
    }
    return map;
  } catch { return {}; }
}

function extractStats(categories = []) {
  const m = {};
  for (const cat of categories) {
    for (const s of cat.stats || []) m[s.name] = parseFloat(s.value) ?? 0;
  }
  return {
    pts:  m.points                   ?? 0,
    reb:  m.rebounds                 ?? 0,
    ast:  m.assists                  ?? 0,
    stl:  m.steals                   ?? 0,
    blk:  m.blocks                   ?? 0,
    fg3m: m.threePointFieldGoalsMade ?? 0,
    tov:  m.turnovers                ?? 0,
    min:  m.minutes                  ?? 0,
    fgm:  m.fieldGoalsMade           ?? 0,
    ftm:  m.freeThrowsMade           ?? 0,
    fta:  m.freeThrowsAttempted      ?? 0,
  };
}

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

async function resolveCompetition(compRef, teamId, teamMap) {
  try {
    const comp = await espnGet(compRef);
    const date = (comp.date || '').slice(0, 10);
    const competitors = comp.competitors || [];
    const us  = competitors.find(c => String(c.id) === String(teamId));
    const opp = competitors.find(c => String(c.id) !== String(teamId));
    const win    = us?.winner === true;
    const _isHome = us?.homeAway === 'home';
    const oppName = teamMap[String(opp?.id)] || '';
    return { _date: date, _opp: oppName, win, _isHome };
  } catch {
    return { _date: '', _opp: '', win: false, _isHome: false };
  }
}

// Process games in batches to stay within timeout limits
async function fetchGameStats(items, teamMap, batchSize = 40) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async item => {
      try {
        const [statsData, compInfo] = await Promise.all([
          espnGet(item.statistics.$ref),
          resolveCompetition(item.competition.$ref, item.teamId, teamMap),
        ]);
        return { ...extractStats(statsData.splits?.categories), ...compInfo };
      } catch { return null; }
    }));
    results.push(...batchResults);
  }
  return results.filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { action, q, id, scope, teamId } = req.query;

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
          id:     p.id,
          name:   p.displayName,
          sub:    p.teamRelationships?.[0]?.displayName || 'WNBA',
          teamId: p.teamRelationships?.[0]?.core?.id || null,
        }));
      return res.json(results);
    }

    // ── Next game: find opponent for H2H auto-fill ────────────────────────────
    if (action === 'nextgame') {
      if (!teamId) return res.json(null);
      const [sb, teamMap] = await Promise.all([
        espnGet('https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard'),
        fetchTeamMap(),
      ]);
      for (const event of sb.events || []) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const us  = (comp.competitors || []).find(c => String(c.id) === String(teamId));
        const opp = (comp.competitors || []).find(c => String(c.id) !== String(teamId));
        if (us) {
          return res.json({
            opp:    teamMap[String(opp?.id)] || '',
            date:   (comp.date || event.date || '').slice(0, 10),
            isHome: us.homeAway === 'home',
          });
        }
      }
      return res.json(null);
    }

    // ── Gamelog ───────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      if (!id) return res.json([]);

      const year = new Date().getFullYear();

      const teamMap = await fetchTeamMap();

      let items;
      if (scope === 'season') {
        items = await fetchEventlogItems(id, year);
      } else {
        // Career: get debut year from ESPN profile so window anchors to career
        // start, not a rolling cutoff. Cap at 12 seasons for WNBA.
        let debutYear = year - 10;
        try {
          const profile = await espnGet(
            `https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}`
          );
          const exp = profile.experience?.years ?? 10;
          debutYear = year - exp;
        } catch {}
        const startYear = Math.max(debutYear, year - 12);
        const careerYears = Array.from(
          { length: year - startYear },
          (_, i) => year - 1 - i
        );
        const allSeasons = await Promise.all(
          careerYears.map(y => fetchEventlogItems(id, y).catch(() => []))
        );
        items = allSeasons.flat();
      }

      if (!items.length) return res.json([]);

      const games = await fetchGameStats(items, teamMap);
      return res.json(games.sort((a, b) => b._date.localeCompare(a._date)));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
