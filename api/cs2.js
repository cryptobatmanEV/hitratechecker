export const config = { maxDuration: 30 };

const CD      = 'https://api-op.grid.gg/central-data/graphql';
const SS      = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SCRAPER = process.env.SCRAPER_API_KEY;
const GRID    = process.env.GRID_API_KEY;
const KV_URL  = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// KV cache with 2s timeout — gracefully skips if Upstash is down/paused
const kvRace = p => Promise.race([p, new Promise(r=>setTimeout(r,2000))]);
async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const r = await kvRace(fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${KV_TOKEN}`}}));
    if (!r) return null;
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}
async function kvSet(key, val, ttl=86400) {
  if (!KV_URL) return;
  try {
    await kvRace(fetch(KV_URL,{method:'POST',headers:{Authorization:`Bearer ${KV_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(['SETEX',key,ttl,JSON.stringify(val)])}));
  } catch {}
}

async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':GRID},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':GRID},body:JSON.stringify({query:q})});return r.json();}
async function scraperFetch(url){
  const r=await fetch(`https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent(url)}`,{headers:{Accept:'text/html'}});
  if(!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

// ── HLTV parsing ──────────────────────────────────────────────────────────────
function parseHLTVMatches(html) {
  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tMatch) return [];
  const rows=[]; const rowRx=/<tr[^>]*>([\s\S]*?)<\/tr>/gi; let rowM;
  while((rowM=rowRx.exec(tMatch[1]))!==null) rows.push(rowM[1]);
  const games=[];
  for(const rowHTML of rows) {
    if(/<th/i.test(rowHTML)) continue;
    const cells=[]; const cRx=/<td[^>]*>([\s\S]*?)<\/td>/gi; let cm;
    while((cm=cRx.exec(rowHTML))!==null)
      cells.push(cm[1].replace(/<[^>]+>/g,'').replace(/&[^;]+;/g,'').replace(/\s+/g,' ').trim());
    if(cells.length<5) continue;
    const kdMatch=cells[4]?.match(/(\d+)\s*-\s*(\d+)/);
    if(!kdMatch) continue;
    const myScore=parseInt((cells[1]||'').match(/\((\d+)\)/)?.[1]);
    const oppScore=parseInt((cells[2]||'').match(/\((\d+)\)/)?.[1]);
    games.push({
      kills:parseInt(kdMatch[1]),deaths:parseInt(kdMatch[2]),
      assists:0,headshots:0,
      win:(!isNaN(myScore)&&!isNaN(oppScore))?myScore>oppScore:null,
      map:cells[3]||'',_date:cells[0]||'',
      _opp:(cells[2]||'').replace(/\(\d+\)/,'').trim()
    });
  }
  return games;
}

function parseHLTVDate(s){
  const m=s&&s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  return m?new Date(`20${m[3]}-${m[2]}-${m[1]}`):new Date(s);
}

function groupIntoSeries(maps){
  const series=[]; let i=0;
  while(i<maps.length){
    const cur=maps[i],group=[cur];
    while(i+group.length<maps.length){
      const next=maps[i+group.length];
      const days=Math.abs(parseHLTVDate(cur._date)-parseHLTVDate(next._date))/86400000;
      if(next._opp===cur._opp&&days<=2) group.push(next); else break;
    }
    const ordered=[...group].reverse();
    series.push({
      kills:group.reduce((s,g)=>s+g.kills,0),
      deaths:group.reduce((s,g)=>s+g.deaths,0),
      assists:0,headshots:0,
      win:group.length===1?cur.win:group.filter(g=>g.win).length>group.length/2,
      maps:ordered.map(g=>({kills:g.kills,deaths:g.deaths,assists:0,headshots:0,map:g.map})),
      _date:cur._date,_opp:cur._opp
    });
    i+=group.length;
  }
  return series;
}

// Find player across all teams in a series state by name match
function findPlayer(seriesState, slug) {
  for (const team of seriesState.teams || []) {
    const player = team.players?.find(p => p.name?.toLowerCase().includes(slug));
    if (player) return { player, team, opp: seriesState.teams.find(t=>t.id!==team.id)?.name||'?' };
  }
  return null;
}

// ── GRID HS enrichment ────────────────────────────────────────────────────────
const SP=`id name kills killAssistsGiven ... on SeriesPlayerStateCs2{headshots} ... on SeriesPlayerStateCsgo{headshots}`;
const GP=`id name kills ... on GamePlayerStateCs2{headshots} ... on GamePlayerStateCsgo{headshots}`;

async function enrichWithGridHS(games, teamId, slug) {
  if (!GRID || !games.length) return;
  try {
    const ninetyDaysAgo = new Date(Date.now()-90*86400000).toISOString();
    const toISO = d => d?.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
      ? `20${d.slice(6)}-${d.slice(3,5)}-${d.slice(0,2)}` : d;

    // ── Pass 1: team-based enrichment (current team) ─────────────────────────
    const cd = await cdQ(`{allSeries(filter:{teamIds:{in:["${teamId}"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:50,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
    const seriesIds = (cd?.data?.allSeries?.edges||[])
      .map(e=>e.node).filter(s=>s.startTimeScheduled)
      .sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled))
      .slice(0,15).map(s=>s.id);

    const gridByDate={};

    if(seriesIds.length) {
      const batchQ = `{${seriesIds.map((id,i)=>`s${i}:seriesState(id:"${id}"){id startedAt teams{id name won players{${SP}}} games{sequenceNumber map{name} teams{id players{${GP}}}}}`).join(' ')}}`;
      const batch = await ssQ(batchQ);
      if(batch?.data) {
        for(const s of Object.values(batch.data)) {
          if(!s) continue;
          for(const team of s.teams||[]) {
            const player=team.players?.find(p=>p.name?.toLowerCase().includes(slug));
            if(!player) continue;
            const date=s.startedAt?.split('T')[0];
            if(!date) continue;
            const mapHS={};
            for(const g of s.games||[]) {
              const gt=g.teams?.find(t=>t.id===team.id);
              const gp=gt?.players?.find(p=>p.name?.toLowerCase().includes(slug));
              if(gp) mapHS[g.sequenceNumber]={hs:gp.headshots||0};
            }
            gridByDate[date]={hs:player.headshots||0,assists:player.killAssistsGiven||0,mapHS,won:team.won};
            break;
          }
        }
      }
    }

    // ── Pass 2: opponent-based fallback for team changes ──────────────────────
    // Phase A: parallel team lookups (fast, just checking if opponent exists in GRID)
    const uncovered = games.filter(g=>!gridByDate[toISO(g._date)]&&g._opp).slice(0,30);
    const withTeams = (await Promise.all(uncovered.map(async game=>{
      try{
        const oppSearch=game._opp.replace(/['"/\\]/g,'').substring(0,12);
        const oppQ=await cdQ(`{teams(filter:{name:{contains:"${oppSearch}"}},first:5){edges{node{id name}}}}`);
        const oppIds=(oppQ?.data?.teams?.edges||[]).map(e=>e.node.id);
        return oppIds.length ? {game,oppIds} : null;
      }catch{return null;}
    }))).filter(Boolean);

    // Phase B: sequential series+stats lookups only for opponents found in GRID
    for(const {game,oppIds} of withTeams){
      try{
        const isoDate=toISO(game._date);
        if(gridByDate[isoDate]) continue; // already filled by earlier iteration
        const d=new Date(isoDate);
        const gte=new Date(d.getTime()-86400000).toISOString().split('T')[0];
        const lte=new Date(d.getTime()+86400000).toISOString().split('T')[0];
        const srQ=await cdQ(`{allSeries(filter:{teamIds:{in:${JSON.stringify(oppIds)}},startTimeScheduled:{gte:"${gte}T00:00:00Z",lte:"${lte}T23:59:59Z"}},first:5,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
        const seriesEdges=srQ?.data?.allSeries?.edges||[];
        if(!seriesEdges.length) continue;
        let found=false;
        for(const edge of seriesEdges){
          if(found) break;
          const sid=edge.node.id;
          const ss=await ssQ(`{seriesState(id:"${sid}"){id startedAt teams{id name won players{${SP}}} games{sequenceNumber map{name} teams{id players{${GP}}}}}}`);
          const sData=ss?.data?.seriesState;
          if(!sData) continue;
          for(const team of sData.teams||[]){
            const player=team.players?.find(p=>p.name?.toLowerCase().includes(slug));
            if(!player) continue;
            const date=sData.startedAt?.split('T')[0];
            if(!date) break;
            const mapHS={};
            for(const g of sData.games||[]){
              const gt=g.teams?.find(t=>t.id===team.id);
              const gp=gt?.players?.find(p=>p.name?.toLowerCase().includes(slug));
              if(gp) mapHS[g.sequenceNumber]={hs:gp.headshots||0};
            }
            gridByDate[date]={hs:player.headshots||0,assists:player.killAssistsGiven||0,mapHS,won:team.won};
            found=true;
            break;
          }
        }
      }catch{}
    }

    // ── Apply gridByDate to all games ─────────────────────────────────────────
    for(const game of games) {
      const isoDate=toISO(game._date);
      const grid=gridByDate[isoDate];
      if(grid) {
        game.headshots=grid.hs;
        game.assists=grid.assists;
        if(grid.won!==undefined) game.win=grid.won;
        game.maps.forEach((m,i)=>{
          const gh=grid.mapHS?.[i+1];
          if(gh) m.headshots=gh.hs;
        });
      }
    }
  } catch(e) { /* enrichment is best-effort */ }
}

// ── KNOWN HLTV IDs ────────────────────────────────────────────────────────────
const KNOWN_IDS={
  'niko':{id:'3741',slug:'NiKo'},'zywoo':{id:'11893',slug:'ZywOo'},
  'device':{id:'7592',slug:'device'},'s1mple':{id:'7998',slug:'s1mple'},
  'm0nesy':{id:'19212',slug:'m0NESY'},'ropz':{id:'11816',slug:'ropz'},
  'rain':{id:'8183',slug:'rain'},'karrigan':{id:'429',slug:'karrigan'},
  'twistzz':{id:'10394',slug:'Twistzz'},'naf':{id:'10395',slug:'NAF'},
  'elige':{id:'9816',slug:'EliGE'},'yekindar':{id:'16015',slug:'YEKINDAR'},
  'blamef':{id:'12605',slug:'blameF'},'broky':{id:'16548',slug:'broky'},
  'frozen':{id:'12830',slug:'frozen'},'apex':{id:'7322',slug:'apEX'},
  'fallen':{id:'702',slug:'FalleN'},'techno':{id:'20275',slug:'Techno'},
  'electronic':{id:'15449',slug:'electronic'},'sh1ro':{id:'18594',slug:'sh1ro'},
  'b1t':{id:'18998',slug:'b1t'},'ax1le':{id:'18689',slug:'Ax1Le'},
  'jame':{id:'12199',slug:'Jame'},'k0nfig':{id:'8399',slug:'k0nfig'},
  'xantares':{id:'12788',slug:'XANTARES'},'grim':{id:'11673',slug:'Grim'},
};

async function resolveHLTV(slug) {
  const key=slug.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(KNOWN_IDS[key]) return KNOWN_IDS[key];
  // Bulk map from HLTV stats page (no render needed)
  const end=new Date().toISOString().split('T')[0];
  const start=new Date(Date.now()-180*86400000).toISOString().split('T')[0];
  const html=await scraperFetch(`https://www.hltv.org/stats/players?startDate=${start}&endDate=${end}`);
  const rx=/href="\/stats\/players\/(\d+)\/([^"?#\/]+)/gi; let m;
  while((m=rx.exec(html))!==null) {
    if(m[2].toLowerCase().includes(key)||key.includes(m[2].toLowerCase()))
      return {id:m[1],slug:m[2]};
  }
  throw new Error(`"${slug}" not found`);
}

// ── GRID-ONLY FALLBACK (when ScraperAPI credits are exhausted) ───────────────
async function getGridOnlyGames(teamId, slug) {
  try {
    const oneYearAgo = new Date(Date.now()-365*86400000).toISOString();
    const cd = await cdQ(`{
      allSeries(filter:{teamIds:{in:["${teamId}"]},startTimeScheduled:{gte:"${oneYearAgo}"}},first:50,orderBy:StartTimeScheduled){
        edges{node{id startTimeScheduled}}
      }
    }`);
    const ids = (cd?.data?.allSeries?.edges||[])
      .map(e=>e.node).sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled))
      .slice(0,15).map(s=>s.id);
    if(!ids.length) return [];

    const batchQuery = `{
      ${ids.map((id,i)=>`s${i}:seriesState(id:"${id}"){
        id startedAt finished
        teams{id name won score players{${SP}}}
        games{sequenceNumber finished map{name} teams{id name won players{${GP}}}}
      }`).join(' ')}
    }`;
    const batch = await ssQ(batchQuery);
    if(!batch?.data) return [];

    return Object.values(batch.data).filter(Boolean).map(s=>{
      const found = findPlayer(s, slug);
      if(!found) return null;
      const {player,team,opp} = found;
      const maps = (s.games||[]).sort((a,b)=>(a.sequenceNumber||0)-(b.sequenceNumber||0)).map(g=>{
        const gt=g.teams?.find(t=>t.id===team.id);
        const gp=gt?.players?.find(p=>p.name?.toLowerCase().includes(slug));
        return {kills:gp?.kills||0,deaths:gp?.deaths||0,assists:gp?.killAssistsGiven||0,headshots:gp?.headshots||0,map:g.map?.name||''};
      });
      return {
        kills:player.kills||0,deaths:player.deaths||0,assists:player.killAssistsGiven||0,
        headshots:player.headshots||0,win:team.won,maps,
        _date:s.startedAt?.split('T')[0]||'',_opp:opp
      };
    }).filter(Boolean).sort((a,b)=>new Date(b._date)-new Date(a._date));
  } catch { return []; }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS') return res.status(200).end();
  const {action,playerId,stat}=req.query;
  const nickname=req.query.nickname||req.query.q||'';

  try {
    // ── SEARCH ──────────────────────────────────────────────────────────────
    if(action==='search') {
      const safe=nickname.replace(/"/g,'');
      // Try GRID first (free)
      if(GRID) {
        for(const f of [`equals:"${safe}"`,`contains:"${safe}"`]) {
          const d=await cdQ(`{players(filter:{nickname:{${f}}},first:10){edges{node{id nickname title{id} team{id name}}}}}`);
          const all=d?.data?.players?.edges?.map(e=>e.node)||[];
          if(!all.length) continue;
          const groups={};
          for(const p of all){const k=p.nickname.toLowerCase();if(!groups[k])groups[k]=[];groups[k].push(p);}
          const players=[];
          for(const profiles of Object.values(groups)){
            const cs2=profiles.find(p=>p.title?.id==='28');
            const csgo=profiles.find(p=>p.title?.id==='1');
            const base=cs2||csgo||profiles[0];
            players.push({
              id:`hybrid_${base.id}_${base.team?.id||'0'}_${base.nickname}`,
              name:base.nickname,sub:`CS2 · ${base.team?.name||'N/A'}`
            });
          }
          if(players.length) return res.json({players});
        }
      }
      return res.json({players:[]});
    }

    // ── GAMELOG ─────────────────────────────────────────────────────────────
    if(action==='gamelog') {
      const parts=(playerId||'').split('_');
      const gridId=parts[1], teamId=parts[2], nickname=parts.slice(3).join('_');
      const slug=nickname.toLowerCase();

      // Cache check — 24hr TTL, saves credits on repeat lookups
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `cs2_${playerId}_${today}`;
      const cached = await kvGet(cacheKey);
      if (cached) return res.json({games: cached});

      // Step 1: HLTV — complete game log, exact kills for every match
      let games = [];
      if(SCRAPER) {
        try {
          const player = await resolveHLTV(slug);
          const end = new Date().toISOString().split('T')[0];
          const start = '2023-09-27'; // CS2 launch date
          const html = await scraperFetch(`https://www.hltv.org/stats/players/matches/${player.id}/${player.slug}?startDate=${start}&endDate=${end}`);
          const rawMaps = parseHLTVMatches(html);
          if(!rawMaps.length) throw new Error('no hltv data');
          games = groupIntoSeries(rawMaps);
        } catch(e) { /* HLTV failed — fall through to GRID */ }
      }

      // Step 2: If HLTV failed or no key, use GRID-only (kills + HS, less coverage)
      if(!games.length && GRID && teamId && teamId!=='0') {
        games = await getGridOnlyGames(teamId, slug);
      }

      if(!games.length) return res.status(404).json({error:`No data found for ${slug}`});

      // Step 3: Enrich HLTV kills with GRID HS (free, best-effort, separate from steps 1/2)
      if(games.length && GRID && teamId && teamId!=='0') {
        await enrichWithGridHS(games, teamId, slug);
      }

      await kvSet(cacheKey, games);
      return res.json({games});
    }

    return res.status(400).json({error:'Unknown action'});
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}
