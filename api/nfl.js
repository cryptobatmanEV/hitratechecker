export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SPORT  = 'football';
const LEAGUE = 'nfl';

async function espnGet(url) {
  const r = await fetch(url.replace('http://', 'https://'), { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

async function fetchTeamMap() {
  try {
    const data = await espnGet(`https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/teams`);
    const map = {};
    for (const sport of data.sports || []) {
      for (const league of sport.leagues || []) {
        for (const entry of league.teams || []) {
          const t = entry.team;
          if (t?.id) map[String(t.id)] = t.abbreviation || t.displayName || t.name || '';
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
    // Passing
    passYds:  m.passingYards          ?? 0,
    passTDs:  m.passingTouchdowns     ?? 0,
    passInt:  m.interceptions         ?? m.passingInterceptions ?? 0,
    passCmp:  m.completions           ?? 0,
    passAtt:  m.passingAttempts       ?? 0,
    passRtg:  m.passerRating          ?? m.QBRating ?? 0,
    // Rushing
    rushYds:  m.rushingYards          ?? 0,
    rushTDs:  m.rushingTouchdowns     ?? 0,
    rushAtt:  m.rushingAttempts       ?? m.carries ?? 0,
    // Receiving
    recYds:   m.receivingYards        ?? 0,
    recTDs:   m.receivingTouchdowns   ?? 0,
    rec:      m.receptions            ?? 0,
    tgt:      m.receivingTargets      ?? m.targets ?? 0,
    // Kicking
    fgm:      m.fieldGoalsMade        ?? 0,
    fga:      m.fieldGoalAttempts     ?? 0,
    xpm:      m.extraPointsMade       ?? 0,
    // Misc
    fum:      m.fumbles               ?? 0,
    sacksGiven: m.sacksTaken          ?? 0,
  };
}

async function fetchSeasonItems(athleteId, season) {
  const items = [];
  // Explicitly fetch type 2 (regular season) AND type 3 (postseason/playoffs)
  // The generic eventlog endpoint often omits postseason — typed endpoints are reliable
  for (const type of [2, 3]) {
    let page = 1;
    while (true) {
      const url = `https://sports.core.api.espn.com/v2/sports/${SPORT}/leagues/${LEAGUE}/seasons/${season}/types/${type}/athletes/${athleteId}/eventlog?limit=25&page=${page}`;
      try {
        const data = await espnGet(url);
        const played = (data.events?.items || []).filter(i => i.played);
        items.push(...played);
        if (page >= (data.events?.pageCount || 1)) break;
        page++;
      } catch {
        break; // type 3 returns 404 if player/team didn't make playoffs — that's fine
      }
    }
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
    return {
      _date:   date,
      _opp:    teamMap[String(opp?.id)] || '',
      win:     us?.winner === true,
      _isHome: us?.homeAway === 'home',
    };
  } catch {
    return { _date: '', _opp: '', win: false, _isHome: false };
  }
}

async function fetchGameStats(items, teamMap, batchSize = 30) {
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

// NFL season: starts ~Sep, so if month < Aug use previous year
function nflSeason(y) {
  return new Date().getMonth() < 7 ? y - 1 : y;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const { action, q, id, scope } = req.query;

  try {
    if (action === 'search') {
      if (!q) return res.json([]);
      const data = await espnGet(
        `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&type=player&sport=${SPORT}&league=${LEAGUE}`
      );
      const results = (data.items || [])
        .filter(p => p.isActive && !p.isRetired)
        .slice(0, 8)
        .map(p => ({
          id:     p.id,
          name:   p.displayName,
          sub:    p.teamRelationships?.[0]?.displayName || 'NFL',
          teamId: p.teamRelationships?.[0]?.core?.id || null,
        }));
      return res.json(results);
    }

    if (action === 'gamelog') {
      if (!id) return res.json([]);
      const year = new Date().getFullYear();
      const curSeason = nflSeason(year);
      const teamMap = await fetchTeamMap();

      // Fetch 3 NFL seasons (regular + postseason fetched explicitly per season)
      const seasons = [curSeason, curSeason - 1, curSeason - 2];
      const allSeasons = await Promise.all(
        seasons.map(y => fetchSeasonItems(id, y).catch(() => []))
      );
      const items = allSeasons.flat();
      if (!items.length) return res.json([]);

      const games = await fetchGameStats(items, teamMap);
      return res.json(games.sort((a, b) => b._date.localeCompare(a._date)));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
