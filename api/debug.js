export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };

  // ── CS2: Verify championship filter for nython ───────────────────────────
  try {
    const sr = await fetch('https://open.faceit.com/data/v4/players?nickname=nython&game=cs2', {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const sd = await sr.json();
    const pid = sd.player_id;

    const hr = await fetch(`https://open.faceit.com/data/v4/players/${pid}/history?game=cs2&limit=20&offset=0`, {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const hd = await hr.json();
    const all   = hd.items || [];
    const pro   = all.filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');
    const pugs  = all.filter(m => m.competition_type === 'matchmaking');

    R.cs2_nython = {
      total_matches: all.length,
      pro_matches:   pro.length,
      pug_matches:   pugs.length,
      pro_sample:    pro.slice(0,3).map(m=>({ competition_name: m.competition_name, date: m.started_at ? new Date(m.started_at*1000).toISOString().split('T')[0] : '' }))
    };
  } catch(e) { R.cs2_error = e.message; }

  // ── LoL: Test feed window with confirmed real game ID + fixed timestamp ───
  try {
    // Confirmed real LCK game from previous debug: 115548128962840616 (HLE vs DK, 2026-04-08)
    const gameId  = '115548128962840616';
    const gameDate = '2026-04-08';
    const fixedTs  = `${gameDate}T23:59:50.000Z`; // divisible by 10 seconds

    const feedRes = await fetch(`https://feed.lolesports.com/livestats/v1/window/${gameId}?startingTime=${fixedTs}`);
    R.lol_feed_status = feedRes.status;

    if (feedRes.ok) {
      const wd = await feedRes.json();
      const frames    = wd.frames || [];
      const lastFrame = frames[frames.length - 1];
      const blueMeta  = wd.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
      const redMeta   = wd.gameMetadata?.redTeamMetadata?.participantMetadata  || [];
      R.lol_feed_result = {
        frameCount: frames.length,
        players:    [...blueMeta, ...redMeta].map(p => p.summonerName),
        sample_stats: lastFrame?.participants?.slice(0,2).map(p => ({
          participantId: p.participantId,
          kills:   p.kills,
          deaths:  p.deaths,
          assists: p.assists,
          cs:      p.creepScore,
        }))
      };
    } else {
      R.lol_feed_error = await feedRes.text();
    }
  } catch(e) { R.lol_error = e.message; }

  return res.status(200).json(R);
}
