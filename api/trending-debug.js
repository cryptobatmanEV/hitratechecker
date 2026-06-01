export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const H = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;

  // Simulate ALL 25 parallel calls exactly like trending.js does
  const pp = await fetch('https://api.prizepicks.com/projections?league_id=9&per_page=250',{headers:H});
  const pd = await pp.json();
  const pMap = {};
  for (const i of pd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name};
  const projs = (pd.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed').map(p=>{
    const pid=p.relationships?.new_player?.data?.id;
    return { name:pMap[pid]?.name, stat:p.attributes?.stat_type, line:parseFloat(p.attributes?.line_score)||0 };
  }).filter(p=>p.name&&p.stat&&p.line>0);
  const seen=new Set(), unique=[];
  for(const p of projs){ if(!seen.has(p.name)&&unique.length<25){seen.add(p.name);unique.push(p.name);}}

  // Step 1: findPlayer for all 25 in parallel
  const playerObjs = {};
  await Promise.all(unique.map(async name => {
    const n = norm(name);
    const sr = await fetch(`https://${host}/api/nfl?action=search&q=${encodeURIComponent(name)}`);
    const sd = await sr.json().catch(()=>[]);
    const list = Array.isArray(sd)?sd:[];
    const p = list.find(p=>norm(p.name)===n)||list[0]||null;
    if(p) playerObjs[name]=p;
  }));

  // Step 2: fetchLog for all 25 in parallel WITH 7s timeout (exact same as trending.js)
  const logMap = {};
  const fetchWithTimeout = (p,ms=7000) => Promise.race([p, new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);
  const t0 = Date.now();
  await Promise.all(Object.entries(playerObjs).map(async ([name,p]) => {
    try {
      const r = await fetchWithTimeout(fetch(`https://${host}/api/nfl?action=gamelog&id=${encodeURIComponent(p.id||'')}`));
      const d = await r.json();
      logMap[name] = Array.isArray(d)?d:[];
    } catch(e) {
      logMap[name] = { error: e.message };
    }
  }));
  const totalMs = Date.now()-t0;

  const summary = Object.fromEntries(Object.entries(logMap).map(([k,v])=>[k, Array.isArray(v)?v.length:`ERROR:${v.error}`]));
  return res.json({ players_found: Object.keys(playerObjs).length, total_fetch_ms: totalMs, log_counts: summary });
}
