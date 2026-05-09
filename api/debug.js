export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = {};

  async function t(label, fn) {
    try { R[label] = { ok: true, ...(await Promise.race([fn(), new Promise((_, j) => setTimeout(() => j(new Error('TIMEOUT')), 6000))])) }; }
    catch(e) { R[label] = { ok: false, error: e.message }; }
  }

  R.env = {
    RIOT_API_KEY: process.env.RIOT_API_KEY ? `SET (${process.env.RIOT_API_KEY.slice(0,12)}...)` : 'NOT SET',
    FACEIT_API_KEY: process.env.FACEIT_API_KEY ? `SET (${process.env.FACEIT_API_KEY.slice(0,8)}...)` : 'NOT SET',
  };

  await t('faceit_search', async () => {
    const r = await fetch('https://open.faceit.com/data/v4/search/players?nickname=s1mple&game=cs2&limit=3', { headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` } });
    const d = await r.json();
    return { status: r.status, found: (d.items||[]).length, first: d.items?.[0]?.nickname };
  });

  await t('faceit_match_stats', async () => {
    const p = await fetch('https://open.faceit.com/data/v4/players?nickname=s1mple&game=cs2', { headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` } });
    const pd = await p.json();
    const h = await fetch(`https://open.faceit.com/data/v4/players/${pd.player_id}/history?game=cs2&limit=1`, { headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` } });
    const hd = await h.json();
    const mid = hd.items?.[0]?.match_id;
    const s = await fetch(`https://open.faceit.com/data/v4/matches/${mid}/stats`, { headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` } });
    const sd = await s.json();
    const pl = sd.rounds?.[0]?.teams?.[0]?.players?.[0];
    return { status: s.status, statKeys: pl ? Object.keys(pl.player_stats||{}).join(', ') : 'none' };
  });

  await t('riot_account', async () => {
    const r = await fetch('https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Faker/T1', { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } });
    const d = await r.json();
    return { status: r.status, gameName: d.gameName, hasPuuid: !!d.puuid, error: d.status?.message };
  });

  await t('mlb_search', async () => {
    const r = await fetch('https://statsapi.mlb.com/api/v1/people/search?names=Ohtani&sportId=1&active=true');
    const d = await r.json();
    return { status: r.status, found: (d.people||[]).length };
  });

  return res.status(200).json({ timestamp: new Date().toISOString(), ...R });
}
