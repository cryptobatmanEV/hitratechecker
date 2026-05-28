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

  // Top-level events, not team-level
  const eventlog = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes/${id}/eventlog?limit=5`);
  const topEvents = eventlog.events || {};
  const eventKeys = Object.keys(topEvents);
  out.top_level_event_count = eventKeys.length;
  out.top_level_event_keys = eventKeys.slice(0, 3);
  out.first_top_event = topEvents[eventKeys[0]];

  // Follow statistics $ref if present in top-level event
  const firstEvent = topEvents[eventKeys[0]];
  const statsRef = Array.isArray(firstEvent?.statistics)
    ? firstEvent.statistics[0]?.$ref
    : firstEvent?.statistics?.$ref;

  out.stats_ref_found = statsRef || null;

  if (statsRef) {
    const stats = await get(statsRef);
    out.stats_keys = Object.keys(stats);
    out.stats_categories = stats.splits?.categories?.map(c => ({
      name: c.name,
      stats: c.stats?.map(s => `${s.name}: ${s.value}`)
    }));
  }

  // Also check: maybe limit=5 is too small and no games played yet — try limit=1&page=1 differently
  out.raw_eventlog_preview = JSON.stringify(eventlog).slice(0, 600);

  return res.json(out);
}
