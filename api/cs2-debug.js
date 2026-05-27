export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SCRAPER = process.env.SCRAPER_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SP = `id name kills killAssistsGiven ... on SeriesPlayerStateCs2{headshots} ... on SeriesPlayerStateCsgo{headshots}`;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function scraperFetch(url){const r=await fetch(`https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent(url)}`,{headers:{Accept:'text/html'}});if(!r.ok)throw new Error(`ScraperAPI ${r.status}`);return r.text();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const slug = 'swisher';
  const teamId = '52200';
  const out = {};

  // Step 1: Get HLTV game dates (first page only for speed)
  try {
    const html = await scraperFetch(`https://www.hltv.org/stats/players/matches/114025/Swisher?startDate=2023-09-27&endDate=2026-05-27`);
    const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; const rows = []; let m;
    while((m=rowRx.exec(tMatch?.[1]||''))!==null) { if(!/<th/i.test(m[1])) rows.push(m[1]); }
    const dates = rows.slice(0,15).map(r => {
      const cells=[]; const cRx=/<td[^>]*>([\s\S]*?)<\/td>/gi; let cm;
      while((cm=cRx.exec(r))!==null) cells.push(cm[1].replace(/<[^>]+>/g,'').trim());
      const raw = cells[0]||'';
      const iso = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
        ? `20${raw.slice(6)}-${raw.slice(3,5)}-${raw.slice(0,2)}` : raw;
      return {raw, iso, opp:(cells[2]||'').replace(/\(\d+\)/,'').trim()};
    });
    out.hltv_dates = dates;
  } catch(e) { out.hltv_error = e.message; }

  // Step 2: Build gridByDate exactly as enrichWithGridHS does
  const ninetyDaysAgo = new Date(Date.now()-90*86400000).toISOString();
  const cd = await cdQ(`{allSeries(filter:{teamIds:{in:["${teamId}"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:50,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
  const seriesIds = (cd?.data?.allSeries?.edges||[])
    .map(e=>e.node).filter(s=>s.startTimeScheduled)
    .sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled))
    .slice(0,15).map(s=>s.id);
  out.grid_series_ids = seriesIds;

  // Step 3: Batch query and show what gridByDate contains
  const batchQuery = `{${seriesIds.map((id,i)=>`s${i}:seriesState(id:"${id}"){id startedAt teams{id name players{${SP}}}}`).join(' ')}}`;
  const batch = await ssQ(batchQuery);
  out.batch_has_data = !!batch?.data;
  out.batch_errors = batch?.errors?.map(e=>e.message);

  const gridByDate = {};
  for(const s of Object.values(batch?.data||{})) {
    if(!s) continue;
    for(const team of s.teams||[]) {
      const player = team.players?.find(p=>p.name?.toLowerCase().includes(slug));
      if(!player) continue;
      const date = s.startedAt?.split('T')[0];
      if(date) gridByDate[date] = {hs:player.headshots||0, kills:player.kills||0, name:player.name};
      break;
    }
  }
  out.gridByDate = gridByDate;
  out.gridByDate_count = Object.keys(gridByDate).length;

  return res.json(out);
}
