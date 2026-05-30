export const config = { maxDuration: 30 };

// PrizePicks league IDs
const PP_LEAGUES = {
  nba:  7,
  nfl:  1,
  mlb:  2,
  nhl:  8,
  wnba: 35,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Step 1: verify PrizePicks API is accessible and find all league IDs
  try {
    const r = await fetch('https://api.prizepicks.com/leagues', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://app.prizepicks.com/',
      }
    });
    const d = await r.json();
    const leagues = (d.data || []).map(l => ({
      id: l.id,
      name: l.attributes?.name,
      sport: l.attributes?.sport,
      active: l.attributes?.active,
    }));
    return res.json({ status: r.status, league_count: leagues.length, leagues });
  } catch(e) {
    return res.json({ error: e.message });
  }
}
