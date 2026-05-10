export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
  const cayenne = encodeURIComponent('playerId=8480839 and seasonId=20252026 and gameTypeId=2');

  const r = await fetch(
    `https://api.nhle.com/stats/rest/en/skater/realtime?isAggregate=false&isGame=true&limit=3&sort=gameDate&cayenneExp=${cayenne}`,
    { headers: HEADERS }
  );
  const d = await r.json();

  return res.json({
    status: r.status,
    first_game_keys: Object.keys(d.data?.[0] || {}),
    first_game: d.data?.[0],
  });
}
