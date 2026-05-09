export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
  const ESB  = 'https://esports-api.lolesports.com/persisted/gw';
  const FEED = 'https://feed.lolesports.com/livestats/v1';
  const R = { pages: [] };

  // Walk through ALL available schedule pages and find T1 matches
  let pageToken = null;
  let page = 0;

  while (page < 10) { // safety cap
    const url = pageToken
      ? `${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058&pageToken=${encodeURIComponent(pageToken)}`
      : `${ESB}/getSchedule?hl=en-US&leagueId=98767991310872058`;

    const r = await fetch(url, { headers: { 'x-api-key': KEY } });
    const d = await r.json();
    const events = d.data?.schedule?.events || [];
    const completed = events.filter(e => e.state === 'completed');
    const t1 = completed.filter(e => (e.match?.teams||[]).some(t => t.code === 'T1'));

    R.pages.push({
      page,
      totalEvents: events.length,
      completedEvents: completed.length,
      t1Matches: t1.length,
      dateRange: completed.length ? {
        newest: completed[0]?.startTime?.split('T')[0],
        oldest: completed[completed.length-1]?.startTime?.split('T')[0]
      } : null,
      hasOlder: !!d.data?.schedule?.pages?.older
    });

    pageToken = d.data?.schedule?.pages?.older;
    page++;
    if (!pageToken) break;
  }

  // Also test feed availability for the OLDEST T1 game we can find
  const lastPage = R.pages[R.pages.length - 1];
  R.totalPages = page;
  R.summary = `${R.pages.reduce((a,p) => a + p.t1Matches, 0)} T1 matches across ${page} pages`;

  return res.status(200).json(R);
}
