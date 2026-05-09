export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };

  // ── Full end-to-end test: extract Zeka's stats from HLE vs DK ──────────
  try {
    const gameId  = '115548128962840616';
    const feedRes = await fetch(
      `https://feed.lolesports.com/livestats/v1/window/${gameId}?startingTime=2026-04-08T23:59:50.000Z`
    );
    const wd = await feedRes.json();
    const frames = wd.frames || [];
    const last   = frames[frames.length - 1];

    const blueMeta = wd.gameMetadata?.blueTeamMetadata?.participantMetadata || [];
    const redMeta  = wd.gameMetadata?.redTeamMetadata?.participantMetadata  || [];

    // Find Zeka (HLE mid laner) in metadata
    const zekaId  = [...blueMeta, ...redMeta].find(p => p.summonerName?.toLowerCase().includes('zeka'))?.participantId;

    // Stats are inside blueTeam.participants (confirmed)
    const zeka = last?.blueTeam?.participants?.find(p => p.participantId === zekaId);

    R.extraction_test = {
      zeka_participantId: zekaId,
      zeka_kills:   zeka?.kills,
      zeka_deaths:  zeka?.deaths,
      zeka_assists: zeka?.assists,
      zeka_cs:      zeka?.creepScore,
      blue_gold:    last?.blueTeam?.totalGold,
      red_gold:     last?.redTeam?.totalGold,
      blue_wins:    (last?.blueTeam?.totalGold || 0) > (last?.redTeam?.totalGold || 0),
    };
  } catch(e) { R.lol_error = e.message; }

  // ── CS2: Verify pro-only filter pulls championship matches ───────────────
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
    const pro = (hd.items || []).filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');

    // Fetch stats for first pro match to confirm aggregation
    if (pro[0]) {
      const sr2 = await fetch(`https://open.faceit.com/data/v4/matches/${pro[0].match_id}/stats`, {
        headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
      });
      const sd2 = await sr2.json();
      const rounds = sd2.rounds || [];
      let totalKills = 0;
      for (const round of rounds) {
        for (const team of round.teams || []) {
          const p = (team.players || []).find(x => x.player_id === pid);
          if (p) totalKills += parseInt(p.player_stats?.['Kills'] || 0);
        }
      }
      R.cs2_pro_match = {
        competition: pro[0].competition_name,
        date: new Date(pro[0].started_at * 1000).toISOString().split('T')[0],
        maps_played: rounds.length,
        total_kills_all_maps: totalKills,
      };
    }
  } catch(e) { R.cs2_error = e.message; }

  return res.status(200).json(R);
}
