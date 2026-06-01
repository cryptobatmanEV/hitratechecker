export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;

  // Test ONE NFL gamelog call in isolation — no concurrency
  const t1 = Date.now();
  const r = await fetch(`https://${host}/api/nfl?action=gamelog&id=4431452`); // Drake Maye
  const ms = Date.now()-t1;
  const d = await r.json().catch(()=>({error:'parse'}));
  const games = Array.isArray(d) ? d : [];

  return res.json({
    status: r.status,
    ms,
    game_count: games.length,
    sample: games[0],
    raw_if_empty: games.length === 0 ? JSON.stringify(d).slice(0,300) : null
  });
}
