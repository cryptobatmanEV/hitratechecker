export const config = { maxDuration: 30 };
const SCRAPER = process.env.SCRAPER_API_KEY;
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SP = `id name kills killAssistsGiven ... on SeriesPlayerStateCs2{headshots} ... on SeriesPlayerStateCsgo{headshots}`;
const GP = `id name kills ... on GamePlayerStateCs2{headshots} ... on GamePlayerStateCsgo{headshots}`;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function scraperFetch(url){const r=await fetch(`https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent(url)}`,{headers:{Accept:'text/html'}});if(!r.ok)throw new Error(`ScraperAPI ${r.status}`);return r.text();}

function parseHLTVMatches(html){
  const tMatch=html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if(!tMatch)return[];
  const rows=[];const rowRx=/<tr[^>]*>([\s\S]*?)<\/tr>/gi;let rowM;
  while((rowM=rowRx.exec(tMatch[1]))!==null)rows.push(rowM[1]);
  const games=[];
  for(const rowHTML of rows){
    if(/<th/i.test(rowHTML))continue;
    const cells=[];const cRx=/<td[^>]*>([\s\S]*?)<\/td>/gi;let cm;
    while((cm=cRx.exec(rowHTML))!==null)cells.push(cm[1].replace(/<[^>]+>/g,'').replace(/&[^;]+;/g,'').replace(/\s+/g,' ').trim());
    if(cells.length<5)continue;
    const kdMatch=cells[4]?.match(/(\d+)\s*-\s*(\d+)/);
    if(!kdMatch)continue;
    games.push({kills:parseInt(kdMatch[1]),deaths:parseInt(kdMatch[2]),headshots:0,
      _date:cells[0]||'',_opp:(cells[2]||'').replace(/\(\d+\)/,'').trim()});
  }
  return games;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Fetch HLTV page 1 and show raw game dates
  try {
    const html = await scraperFetch(`https://www.hltv.org/stats/players/matches/114025/Swisher?startDate=2023-09-27&endDate=2026-05-28`);
    const maps = parseHLTVMatches(html);
    out.hltv_map_count = maps.length;
    out.hltv_first_5_dates = maps.slice(0,5).map(m=>({raw_date:m._date, opp:m._opp, kills:m.kills}));
    // Show what isoDate conversion produces
    out.hltv_iso_conversion = maps.slice(0,5).map(m=>{
      const d = m._date;
      const iso = d?.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
        ? `20${d.slice(6)}-${d.slice(3,5)}-${d.slice(0,2)}` : d;
      return {raw:d, iso};
    });
  } catch(e){ out.hltv_error = e.message; }

  // 2. Build gridByDate and show it
  const ninetyDaysAgo = new Date(Date.now()-90*86400000).toISOString();
  const cd = await cdQ(`{allSeries(filter:{teamIds:{in:["52200"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:50,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
  const seriesIds = (cd?.data?.allSeries?.edges||[])
    .map(e=>e.node).filter(s=>s.startTimeScheduled)
    .sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled))
    .slice(0,15).map(s=>s.id);

  const batchQuery = `{${seriesIds.map((id,i)=>`s${i}:seriesState(id:"${id}"){id startedAt teams{id name players{${SP}}} games{sequenceNumber teams{id players{${GP}}}}}`).join(' ')}}`;
  const batch = await ssQ(batchQuery);

  const gridByDate = {};
  for(const s of Object.values(batch?.data||{})){
    if(!s)continue;
    for(const team of s.teams||[]){
      const player=team.players?.find(p=>p.name?.toLowerCase().includes('swisher'));
      if(!player)continue;
      const date=s.startedAt?.split('T')[0];
      if(!date)continue;
      const mapHS={};
      for(const g of s.games||[]){
        const gt=g.teams?.find(t=>t.id===team.id);
        const gp=gt?.players?.find(p=>p.name?.toLowerCase().includes('swisher'));
        if(gp)mapHS[g.sequenceNumber]={hs:gp.headshots||0};
      }
      gridByDate[date]={hs:player.headshots||0,mapHS,mapHScount:Object.keys(mapHS).length};
      break;
    }
  }
  out.gridByDate = gridByDate;

  return res.json(out);
}
