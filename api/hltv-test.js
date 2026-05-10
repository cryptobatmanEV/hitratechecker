// api/hltv-test.js — Deploy this, hit /api/hltv-test?player=NiKo
// If it returns data, HLTV npm package works from Vercel. If 403/error, it doesn't.
// Remove this file after testing.

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { player = 'NiKo' } = req.query;

  try {
    const { HLTV } = await import('hltv');

    // Step 1: find the player
    const results = await HLTV.getPlayerByName({ name: player });
    if (!results?.id) {
      return res.json({ success: false, error: 'Player not found', player });
    }

    // Step 2: get recent stats
    const stats = await HLTV.getPlayerStats({ id: results.id });

    return res.json({
      success: true,
      player: results.name,
      id: results.id,
      team: results.team?.name || null,
      country: results.country?.name || null,
      rating: stats?.overallStatistics?.rating || null,
      kills: stats?.overallStatistics?.kills || null,
      maps: stats?.overallStatistics?.mapsPlayed || null,
      message: 'HLTV npm package works from Vercel — CS2 data is unlocked!',
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
      hint: e.message.includes('403') || e.message.includes('Cloudflare')
        ? 'Cloudflare is blocking Vercel IPs — HLTV npm package will not work'
        : 'Unknown error — check Vercel logs',
    });
  }
}
