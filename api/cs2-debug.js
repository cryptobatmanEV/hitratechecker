export const config = { maxDuration: 30 };
const SCRAPER = process.env.SCRAPER_API_KEY;
const GRID_KEY = process.env.GRID_API_KEY;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SP = `id name kills killAssistsGiven ... on SeriesPlayerStateCs2{headshots} ... on SeriesPlayerStateCsgo{headshots}`;

async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':GRID_KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':GRID_KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: Check what KV has cached right now
  try {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `cs2_hybrid_114025_52200_Swisher_${today}`;
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(cacheKey)}`,{headers:{Authorization:`Bearer ${KV_TOKEN}`}});
    const d = await r.json();
    if(d.result) {
      const cached = JSON.parse(d.result);
      out.cache_hit = true;
      out.cache_game_count = cached.length;
      out.cache_sample_hs = cached.slice(0,5).map(g=>({date:g._date,opp:g._opp,headshots:g.headshots}));
    } else {
      out.cache_hit = false;
    }
  } catch(e) { out.cache_error = e.message; }

  // Step 2: Build gridByDate directly
  const ninetyDaysAgo = new Date(Date.now()-90*86400000).toISOString();
  const cd = await cdQ(`{allSeries(filter:{teamIds:{in:["52200"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:50,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
  const seriesIds = (cd?.data?.allSeries?.edges||[])
    .map(e=>e.node).filter(s=>s.startTimeScheduled)
    .sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled))
    .slice(0,15).map(s=>s.id);

  const batchQuery = `{${seriesIds.map((id,i)=>`s${i}:seriesState(id:"${id}"){id startedAt teams{id name players{${SP}}}}`).join(' ')}}`;
  const batch = await ssQ(batchQuery);

  const gridByDate = {};
  for(const s of Object.values(batch?.data||{})) {
    if(!s) continue;
    for(const team of s.teams||[]) {
      const player = team.players?.find(p=>p.name?.toLowerCase().includes('swisher'));
      if(!player) continue;
      const date = s.startedAt?.split('T')[0];
      if(date) gridByDate[date] = {hs:player.headshots||0, kills:player.kills||0};
      break;
    }
  }
  out.gridByDate = gridByDate;

  // Step 3: Fetch HLTV and show what dates come back + what isoDate conversion produces
  try {
    const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/114025/Swisher?startDate=2023-09-27&endDate=2026-05-28')}`,{headers:{Accept:'text/html'}});
    const html = await r.text();
    const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; const rows=[]; let m;
    while((m=rowRx.exec(tMatch?.[1]||''))!==null){if(!/<th/i.test(m[1]))rows.push(m[1]);}
    const games = rows.slice(0,8).map(row=>{
      const cells=[]; const cRx=/<td[^>]*>([\s\S]*?)<\/td>/gi; let cm;
      while((cm=cRx.exec(row))!==null)cells.push(cm[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim());
      const raw = cells[0]||'';
      const iso = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
        ? `20${raw.slice(6)}-${raw.slice(3,5)}-${raw.slice(0,2)}` : `NO_MATCH:${raw}`;
      const inGrid = !!gridByDate[iso];
      return {raw_date:raw, iso_date:iso, opp:(cells[2]||'').replace(/\(\d+\)/,'').trim(), in_grid:inGrid, grid_hs:gridByDate[iso]?.hs||0};
    });
    out.hltv_dates_vs_grid = games;
  } catch(e){ out.hltv_error = e.message; }

  return res.json(out);
}
