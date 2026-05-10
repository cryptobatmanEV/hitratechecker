export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { playerId = '8480839' } = req.query; // Dahlin

  try {
    const r = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
    });
    const d = await r.json();
    // Show the seasonTotals structure
    return res.json({
      name: d.firstName?.default + ' ' + d.lastName?.default,
      seasons: (d.seasonTotals || []).filter(s => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2)
        .map(s => ({ season: s.season, gp: s.gamesPlayed, g: s.goals, a: s.assists, pts: s.points, shots: s.shots, blk: s.blockedShots })),
      featuredStatsKeys: Object.keys(d.featuredStats || {}),
      careerTotalsKeys: Object.keys(d.careerTotals || {}),
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
