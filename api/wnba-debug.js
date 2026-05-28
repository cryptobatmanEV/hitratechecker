export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const get = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { headers: {'User-Agent': UA}, signal: ctrl.signal });
    clearTimeout(t);
    return r.json();
  };

  const id = '4433403';
  const out = {};

  // Step 1: Full eventlog structure
  const eventlog = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}/eventlog?limit=5`);
  out.eventlog_keys = Object.keys(eventlog);
  out.teams_keys = Object.keys(eventlog.teams || {});

  // Get first team's events
  const firstTeamKey = Object.keys(eventlog.teams || {})[0];
  const firstTeam = eventlog.teams?.[firstTeamKey];
  out.team_object_keys = Object.keys(firstTeam || {});

  const events = firstTeam?.events || {};
  const eventKeys = Object.keys(events);
  out.event_count = eventKeys.length;
  out.first_event_keys = Object.keys(events[eventKeys[0]] || {});
  out.first_event_full = events[eventKeys[0]];

  // Step 2: Follow the statistics $ref for the first event if it exists
  const firstEventStats = events[eventKeys[0]]?.statistics;
  if (firstEventStats?.$ref) {
    try {
      const stats = await get(firstEventStats.$ref);
      out.stats_ref_keys = Object.keys(stats);
      out.stats_splits = stats.splits?.categories?.map(c => ({
        name: c.name,
        stat_names: c.stats?.map(s => s.name)
      }));
      out.stats_preview = JSON.stringify(stats).slice(0, 500);
    } catch(e) { out.stats_ref_error = e.message; }
  } else {
    out.stats_note = 'No statistics $ref — inline or missing';
    out.first_event_stats_raw = firstEventStats;
  }

  return res.json(out);
}
