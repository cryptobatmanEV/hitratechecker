export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function get(url) {
  const r = await fetch(url, { headers:{'User-Agent':UA} });
  return { status: r.status, ok: r.ok, body: r.ok ? await r.json().catch(()=>null) : await r.text().catch(()=>'') };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const id = '4431452'; // Drake Maye
  const season = 2025;
  const out = { player: 'Drake Maye', id };

  // Test 1: ESPN site API gamelog (different from core API — might include postseason)
  const t1 = await get(`https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/gamelog?season=${season}`);
  out.site_api_gamelog = {
    status: t1.status,
    keys: t1.body ? Object.keys(t1.body) : [],
    // Show any categories or splits
    categories: t1.body?.categories?.map(c=>({name:c.name||c.type,count:c.events?.length||c.splits?.length})),
    splits_count: t1.body?.splits?.length,
    events_count: t1.body?.events?.length,
    sample: JSON.stringify(t1.body).slice(0,500),
  };

  // Test 2: Core API statisticslog
  const t2 = await get(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/athletes/${id}/statisticslog?limit=50`);
  out.statisticslog = {
    status: t2.status,
    keys: t2.body ? Object.keys(t2.body) : [],
    count: t2.body?.count,
    items_count: (t2.body?.entries||t2.body?.items||[]).length,
    sample: JSON.stringify(t2.body).slice(0,300),
  };

  // Test 3: Fetch the 17th game's event $ref to see what it is, then look for game 18+
  const eventlog = await get(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/athletes/${id}/eventlog?limit=50`);
  const items = eventlog.body?.events?.items || [];
  out.eventlog_summary = { count: items.length, last_event_ref: items[items.length-1]?.event?.$ref };
  
  // Fetch last regular season game to get its date
  if (items[items.length-1]?.event?.$ref) {
    const lastGame = await get(items[items.length-1].event.$ref);
    out.last_regular_season_game = { date: lastGame.body?.date, name: lastGame.body?.name, season_type: lastGame.body?.season?.type };
  }

  // Test 4: Try fetching games from Patriots team schedule for playoffs
  // Patriots team ID — search for it
  const teamSearch = await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/ne');
  const patId = teamSearch.body?.team?.id;
  out.patriots_id = patId;
  if (patId) {
    // Get Patriots schedule for 2025 postseason
    const sched = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${patId}/schedule?season=${season}&seasontype=3`);
    out.patriots_postseason_schedule = {
      status: sched.status,
      events_count: sched.body?.events?.length,
      games: sched.body?.events?.slice(0,5).map(e=>({
        date: e.date,
        name: e.name,
        id: e.id,
      })),
    };
  }

  return res.json(out);
}
