export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };

  try {
    // Same confirmed game: HLE vs DK, 2026-04-08
    const gameId  = '115548128962840616';
    const feedRes = await fetch(
      `https://feed.lolesports.com/livestats/v1/window/${gameId}?startingTime=2026-04-08T23:59:50.000Z`
    );
    R.feed_status = feedRes.status;

    if (feedRes.ok) {
      const wd = await feedRes.json();
      const frames = wd.frames || [];
      const last   = frames[frames.length - 1];

      // Show the FULL raw structure of one participant so we know exact field names
      R.last_frame_timestamp = last?.rfc460Timestamp;
      R.raw_participant_0    = last?.participants?.[0];        // full object
      R.raw_blue_team        = last?.blueTeam;                 // team-level data
      R.participant_count    = last?.participants?.length;

      // Also show top-level keys on the frame object itself
      R.frame_keys = last ? Object.keys(last) : [];
    } else {
      R.feed_error = await feedRes.text();
    }
  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
