export const config = { maxDuration: 25 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function pp(lid) {
  for (const base of ['https://partner-api.prizepicks.com','https://api.prizepicks.com']) {
    try {
      const r = await fetch(`${base}/projections?league_id=${lid}&per_page=10`,
        {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'},signal:AbortSignal.timeout(6000)});
      const d = await r.json().catch(()=>null);
      if (r.ok) return {status:r.status, source:base.includes('partner')?'partner':'main', count:d?.data?.length, sample_stat:d?.data?.[0]?.attributes?.stat_type};
      if (r.status !== 429 && r.status !== 403) return {status:r.status, source:base};
    } catch(e) { continue; }
  }
  return {status:'all_failed'};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;
  const out = {};

  // 1. PP data for each esports league
  const [lol, dota, cs2] = await Promise.all([pp(121), pp(174), pp(265)]);
  out.pp_lol = lol;
  out.pp_dota = dota;
  out.pp_cs2 = cs2;

  // 2. Is LoL API itself working?
  try {
    const r = await fetch(`https://${host}/api/lol?action=search&q=ShowMaker`,{signal:AbortSignal.timeout(8000)});
    const d = await r.json().catch(()=>null);
    const players = Array.isArray(d)?d:(d?.players||[]);
    out.lol_api = {status:r.status, found:players.length, first:players[0]?.name};
  } catch(e) { out.lol_api = {error:e.message}; }

  // 3. Is GRID key working for CS2?
  try {
    const key = process.env.GRID_API_KEY;
    out.grid_key_present = !!key;
    if (key) {
      const r = await fetch('https://api.grid.gg/central-data/graphql',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body:JSON.stringify({query:'query{allPlayers(filter:{nickname:{includesInsensitive:"s1mple"}}first:3){nodes{id nickname}}}'}),
        signal:AbortSignal.timeout(8000)
      });
      const d = await r.json().catch(()=>null);
      out.grid_test = {status:r.status, nodes:d?.data?.allPlayers?.nodes, error:d?.errors?.[0]?.message};
    }
  } catch(e) { out.grid_test = {error:e.message}; }

  return res.json(out);
}
