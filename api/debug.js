export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const start = Date.now();
  const r = await fetch(
    `https://${req.headers.host}/api/lol?action=gamelog&teamId=98767991853197861&teamCode=T1&leagueName=LCK&playerName=Faker&name=Faker`
  );
  const d = await r.json();
  return res.status(200).json({
    status: r.status,
    ms: Date.now() - start,
    gameCount: d.games?.length,
    error: d.error,
    dateRange: d.games?.length ? {
      newest: d.games[0]._date,
      oldest: d.games[d.games.length - 1]._date
    } : null,
    sample: d.games?.slice(0, 3)
  });
}
