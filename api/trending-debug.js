export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;
  const out = {};

  // Test partner-api directly for each broken sport's league
  const PP = 'https://partner-api.prizepicks.com';
  for (const [name, id] of [['mlb',2],['tennis',5],['lol',121],['dota',174],['cs2',265]]) {
    try {
      const r = await fetch(`${PP}/projections?league_id=${id}&per_page=5`,
        {headers:{Accept:'application/json','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)});
      const d = await r.json().catch(()=>null);
      out[`pp_${name}`] = {status:r.status, count:d?.data?.length??'?', meta:d?.meta};
    } catch(e) { out[`pp_${name}`] = {error:e.message}; }
  }

  // Test trending endpoint for each
  for (const [sport, stat] of [['mlb','Hits'],['tennis','Total Games'],['lol','Kills'],['cs2','Kills'],['dota','Kills']]) {
    try {
      const r = await fetch(`https://${host}/api/trending?sport=${sport}&statType=${encodeURIComponent(stat)}&scope=total`,
        {signal:AbortSignal.timeout(25000)});
      const text = await r.text();
      let body; try{body=JSON.parse(text);}catch{body=text.slice(0,200);}
      out[`trending_${sport}`] = {status:r.status, result:Array.isArray(body)?`${body.length} rows`:body};
    } catch(e) { out[`trending_${sport}`] = {error:e.message}; }
  }

  return res.json(out);
}
