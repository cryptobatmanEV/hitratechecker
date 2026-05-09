export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };
  const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const ESB = 'https://esports-api.lolesports.com/persisted/gw';

  // 1. Get LCK tournaments (not just schedule — actual tournament IDs)
  try {
    const r = await fetch(`${ESB}/getTournamentsForLeague?hl=en-US&leagueId=98767991310872058`, {
      headers: { 'x-api-key': KEY }
    });
    const d = await r.json();
    R.lck_tournaments = (d.data?.leagues?.[0]?.tournaments || []).slice(0,5).map(t => ({
      id: t.id, slug: t.slug, startDate: t.startDate, endDate: t.endDate
    }));
  } catch(e) { R.lck_tournaments_error = e.message; }

  // 2. Test getStatsByTournament if we found a tournament ID
  if (R.lck_tournaments?.length) {
    const tid = R.lck_tournaments[0].id;
    try {
      const r = await fetch(`${ESB}/getStatsByTournament?hl=en-US&tournamentId=${tid}`, {
        headers: { 'x-api-key': KEY }
      });
      const text = await r.text();
      R.stats_by_tournament = { status: r.status, preview: text.slice(0, 500) };
    } catch(e) { R.stats_by_tournament_error = e.message; }
  }

  // 3. Test if a January 2026 LCK game feed window is still accessible
  // Get schedule and find an older match game ID
  try {
    const r = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058`, {
      headers: { 'x-api-key': KEY }
    });
    const d = await r.json();
    const events = d.data?.schedule?.events || [];
    // Get ALL completed events with dates
    const completed = events.filter(e => e.state === 'completed')
      .map(e => ({ matchId: e.match?.id, date: e.startTime, teams: e.match?.teams?.map(t=>t.code) }));
    R.all_lck_completed = completed; // Show all so we can see date range
  } catch(e) { R.schedule_error = e.message; }

  // 4. Test feed window for the confirmed April 8 game — has it expired?
  try {
    const r = await fetch('https://feed.lolesports.com/livestats/v1/window/115548128962840616?startingTime=2026-04-08T23:59:50.000Z');
    const d = await r.json();
    R.april_feed_still_alive = { status: r.status, frameCount: (d.frames||[]).length };
  } catch(e) { R.april_feed_error = e.message; }

  return res.status(200).json(R);
}
