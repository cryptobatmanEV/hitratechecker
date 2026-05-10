export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

  // Dahlin (skater) and Shesterkin (goalie id: 8478009)
  const [skaterRes, goalieRes] = await Promise.all([
    fetch('https://api-web.nhle.com/v1/player/8480839/game-log/20252026/2', { headers: HEADERS }),
    fetch('https://api-web.nhle.com/v1/player/8478009/game-log/20252026/2', { headers: HEADERS }),
  ]);
  const [skaterData, goalieData] = await Promise.all([skaterRes.json(), goalieRes.json()]);

  return res.json({
    skater_first_game_keys: Object.keys(skaterData.gameLog?.[0] || {}),
    skater_first_game: skaterData.gameLog?.[0],
    goalie_first_game_keys: Object.keys(goalieData.gameLog?.[0] || {}),
    goalie_first_game: goalieData.gameLog?.[0],
  });
}
