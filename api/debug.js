export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const ESB  = 'https://esports-api.lolesports.com/persisted/gw';
  const FEED = 'https://feed.lolesports.com/livestats/v1';
  const R = {};

  // Step 1: Get current schedule and check for pageToken (older pages)
  try {
    const r = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058`, {
      headers: { 'x-api-key': KEY }
    });
    const d = await r.json();
    R.schedule_pages = d.data?.schedule?.pages; // Check if older/newer tokens exist
    R.current_oldest_event = d.data?.schedule?.events?.filter(e=>e.state==='completed').slice(-1)[0];
  } catch(e) { R.pages_error = e.message; }

  // Step 2: If older page exists, fetch it and find T1 matches
  if (R.schedule_pages?.older) {
    try {
      const r = await fetch(`${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058&pageToken=${R.schedule_pages.older}`, {
        headers: { 'x-api-key': KEY }
      });
      const d = await r.json();
      const events = d.data?.schedule?.events || [];
      const t1 = events.filter(e => e.state==='completed' && (e.match?.teams||[]).some(t=>t.code==='T1'));
      R.older_page_t1_matches = t1.slice(0,3).map(e=>({ id:e.match?.id, date:e.startTime, teams:e.match?.teams?.map(t=>t.code) }));
      R.older_page_pages = d.data?.schedule?.pages;
    } catch(e) { R.older_page_error = e.message; }
  }

  // Step 3: Test if feed has data from a January 2026 game
  // Try fetching event details from an older T1 match if found
  if (R.older_page_t1_matches?.length) {
    try {
      const match = R.older_page_t1_matches[0];
      const evR = await fetch(`${ESB}/getEventDetails?hl=en-US&id=${match.id}`, { headers: { 'x-api-key': KEY } });
      const evD = await evR.json();
      const games = (evD.data?.event?.match?.games||[]).filter(g=>g.state==='completed');
      if (games[0]) {
        const date = match.date.split('T')[0];
        const feedR = await fetch(`${FEED}/window/${games[0].id}?startingTime=${date}T23:59:50.000Z`);
        const feedD = await feedR.json();
        R.older_feed_test = {
          status: feedR.status,
          date,
          gameId: games[0].id,
          frameCount: (feedD.frames||[]).length,
          has_data: (feedD.frames||[]).length > 0
        };
      }
    } catch(e) { R.older_feed_error = e.message; }
  }

  return res.status(200).json(R);
}
