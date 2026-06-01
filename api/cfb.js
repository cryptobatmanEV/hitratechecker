export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SPORT  = 'football';
const LEAGUE = 'college-football';

async function espnGet(url) {
  const r = await fetch(url.replace('http://', 'https://'), { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

async function fetchTeamMap() {
  try {
    // CFB has hundreds of teams — skip team map, use abbreviation from competition
    return {};
  } catch { return {}; }
}

function extractStats(categories = []) {
  const m = {};
  for (const cat of categories) {
    for (const s of cat.stats || []) m[s.name] = parseFloat(s.value) ?? 0;
  }
  return {
    passYds:  m.passingYards          ?? 0,
    passTDs:  m.passingTouchdowns     ?? 0,
    passInt:  m.interceptions         ?? m.passingInterceptions ?? 0,
    passCmp:  m.completions           ?? 0,
    passAtt:  m.passingAttempts       ?? 0,
    rushYds:  m.rushingYards          ?? 0,
    rushTDs:  m.rushingTouchdowns     ?? 0,
    rushAtt:  m.rushingAttempts       ?? m.carries ?? 0,
    recYds:   m.receivingYards        ?? 0,
    recTDs:   m.receivingTouchdowns   ?? 0,
    rec:      m.receptions            ?? 0,
    tgt:      m.receivingTargets      ?? m.targets ?? 0,
    fgm:      m.fieldGoalsMade        ?? 0,
    fga:      m.fieldGoalAttempts     ?? 0,
    xpm:      m.extraPointsMade       ?? 0,
    fum:      m.fumbles               ?? 0,
  };
}

async function fetchSeasonItems(athleteId, season) {
  const BASE = `https://sports.core.api.espn.com/v2/sports/${SPORT}/leagues/${LEAGUE}/seasons/${season}/athletes/${athleteId}/eventlog`;
  const items = [];
  const seen = new Set();
  let teamId = null;

  // Pass 1: regular season via eventlog (works reliably)
  let page = 1;
  while (true) {
    try {
      const data = await espnGet(`${BASE}?limit=25&page=${page}`);
      for (const i of (data.events?.items || [])) {
        if (!i.played) continue;
        if (!teamId && i.teamId) teamId = i.teamId;
        const key = (i.event?.$ref||'').split('?')[0]; // strip ?lang=en&region=us
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        items.push(i);
      }
      if (page >= (data.events?.pageCount || 1)) break;
      page++;
    } catch { break; }
  }

  // Pass 2: postseason — fetch team schedule (seasontype=3) and construct item refs
  if (teamId) {
    try {
      const schedUrl = `https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}/teams/${teamId}/schedule?season=${season}&seasontype=3`;
      const r = await fetch(schedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const sched = await r.json();
        for (const event of sched.events || []) {
          const eid = event.id;
          const ref = `http://sports.core.api.espn.com/v2/sports/${SPORT}/leagues/${LEAGUE}/events/${eid}`; // no query params = clean key
          if (seen.has(ref)) continue;
          seen.add(ref);
          items.push({
            played: true,
            teamId,
            event:       { $ref: ref },
            competition: { $ref: `${ref}/competitions/${eid}` },
            statistics:  { $ref: `${ref}/competitions/${eid}/competitors/${teamId}/roster/${athleteId}/statistics/0` },
          });
        }
      }
    } catch {}
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
    const oppName = opp?.team?.abbreviation || opp?.team?.shortDisplayName || opp?.team?.displayName || '';
    return { _date: date, _opp: oppName, win: us?.winner === true, _isHome: us?.homeAway === 'home' };
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

// CFB season starts ~Aug; if before July, use previous year
function cfbSeason(y) {
  return new Date().getMonth() < 6 ? y - 1 : y;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const { action, q, id } = req.query;

  try {
    if (action === 'search') {
      if (!q) return res.json([]);
      const data = await espnGet(
        `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&type=player&sport=${SPORT}&league=college-football`
      );
      const results = (data.items || [])
        .filter(p => !p.isRetired) // don't filter isActive — CFB players often show as inactive on ESPN
        .slice(0, 8)
        .map(p => ({
          id:     p.id,
          name:   p.displayName,
          sub:    p.teamRelationships?.[0]?.displayName || 'CFB',
          teamId: p.teamRelationships?.[0]?.core?.id || null,
        }));
      return res.json(results);
    }

    if (action === 'gamelog') {
      if (!id) return res.json([]);
      const year = new Date().getFullYear();
      const curSeason = cfbSeason(year);
      const teamMap = {};

      // Fetch 3 CFB seasons (regular + bowl/playoff fetched explicitly per season)
      const seasons = [curSeason, curSeason - 1, curSeason - 2];
      const allSeasons = await Promise.all(
        seasons.map(y => fetchSeasonItems(id, y).catch(() => []))
      );
      const items = allSeasons.flat();
      if (!items.length) return res.json([]);

      const games = await fetchGameStats(items, teamMap);
      // Deduplicate by date — handles edge cases where same game appears in multiple season fetches
      const seenDates = new Set();
      const unique = games.filter(g=>{ if(!g._date||seenDates.has(g._date)) return false; seenDates.add(g._date); return true; });
      return res.json(unique.sort((a, b) => b._date.localeCompare(a._date)));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
