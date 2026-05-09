export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = { timestamp: new Date().toISOString() };

  // Check env vars
  results.env = {
    RIOT_API_KEY: process.env.RIOT_API_KEY ? `SET (${process.env.RIOT_API_KEY.slice(0,12)}...)` : 'NOT SET',
    FACEIT_API_KEY: process.env.FACEIT_API_KEY ? `SET (${process.env.FACEIT_API_KEY.slice(0,8)}...)` : 'NOT SET',
  };

  // Test CS2 route internally
  try {
    const r = await fetch(`https://${req.headers.host}/api/cs2?action=search&nickname=NiKo`);
    results.cs2_route = { status: r.status, ok: r.ok, preview: (await r.text()).slice(0, 200) };
  } catch(e) { results.cs2_route = { error: e.message }; }

  // Test Riot route internally
  try {
    const r = await fetch(`https://${req.headers.host}/api/riot?action=lookup&gameName=Faker&tagLine=T1&region=kr`);
    results.riot_route = { status: r.status, ok: r.ok, preview: (await r.text()).slice(0, 200) };
  } catch(e) { results.riot_route = { error: e.message }; }

  // Direct FACEIT test
  try {
    const r = await fetch('https://open.faceit.com/data/v4/search/players?nickname=NiKo&game=cs2&limit=3', {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const d = await r.json();
    results.faceit_direct = { status: r.status, found: (d.items||[]).length, first: d.items?.[0]?.nickname };
  } catch(e) { results.faceit_direct = { error: e.message }; }

  return res.status(200).json(results);
}
