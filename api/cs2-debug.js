export const config = { maxDuration: 30 };
const GRID_KEY = process.env.GRID_API_KEY;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const SCRAPER = process.env.SCRAPER_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SP = `id name kills ... on SeriesPlayerStateCs2{headshots}`;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':GRID_KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':GRID_KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. KV cache check — what's stored for Swisher today
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `cs2_hybrid_114025_52200_Swisher_${today}`;
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${KV_TOKEN}`}});
    const d = await r.json();
    if(d.result) {
      const cached = JSON.parse(d.result);
      out.cache = {hit:true, games:cached.length, sample_hs: cached.slice(0,5).map(g=>({date:g._date,opp:g._opp,hs:g.headshots}))};
    } else {
      out.cache = {hit:false};
    }
  } catch(e){ out.cache = {error:e.message}; }

  // 2. ScraperAPI — just check if it responds at all (5s timeout)
  try {
    const ctrl = new AbortController();
    setTimeout(()=>ctrl.abort(), 5000);
    const r = await fetch(`https://api.scraperapi.com/account?api_key=${SCRAPER}`, {signal:ctrl.signal});
    const txt = await r.text();
    out.scraper = {status:r.status, body:txt.substring(0,200)};
  } catch(e){ out.scraper = {error:e.message}; }

  // 3. GRID — build gridByDate for M80/Swisher
  const ninetyDaysAgo = new Date(Date.now()-90*86400000).toISOString();
  const cd = await cdQ(`{allSeries(filter:{teamIds:{in:["52200"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:50,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
  const ids = (cd?.data?.allSeries?.edges||[]).map(e=>e.node)
    .sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled))
    .slice(0,10).map(s=>s.id);
  const batch = await ssQ(`{${ids.map((id,i)=>`s${i}:seriesState(id:"${id}"){id startedAt teams{name players{${SP}}}}`).join(' ')}}`);
  const gridByDate={};
  for(const s of Object.values(batch?.data||{})){
    if(!s)continue;
    for(const team of s.teams||[]){
      const p=team.players?.find(p=>p.name?.toLowerCase().includes('swisher'));
      if(!p)continue;
      gridByDate[s.startedAt?.split('T')[0]]={hs:p.headshots||0,kills:p.kills||0};
      break;
    }
  }
  out.grid = {dates:gridByDate, count:Object.keys(gridByDate).length};

  return res.json(out);
}
