export const config = { maxDuration: 30 };

const FACEIT_KEY  = process.env.FACEIT_API_KEY;
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';
const KV_URL      = process.env.KV_REST_API_URL;
const KV_TOKEN    = process.env.KV_REST_API_TOKEN;

// Cache resets daily at midnight UTC — ensures today's game shows tomorrow
// Player ID lookups cached 7 days (HLTV IDs never change)
const CACHE_TTL = 60 * 60 * 24; // 24 hours for gamelog data

const KV_TIMEOUT = 2000;
const kvRace = p => Promise.race([p, new Promise(r=>setTimeout(r,KV_TIMEOUT))]);

async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const r = await kvRace(fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${KV_TOKEN}`}}));
    if (!r) return null;
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

async function kvSet(key, val, ttl=CACHE_TTL) {
  if (!KV_URL) return;
  try {
    await kvRace(fetch(KV_URL,{method:'POST',headers:{Authorization:`Bearer ${KV_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(['SETEX',key,ttl,JSON.stringify(val)])}));
  } catch {}
}

const PRO_SLUGS = [
  'NiKo','ZywOo','device','s1mple','m0NESY','rain','ropz','broky','karrigan',
  'frozen','blameF','torzsi','xertioN','nicoodoz','TeSeS','sjuush','jabbi',
  'dupreeh','Magisk','KRIMZ','hampus','headtr1ck','apEX','mezii','Spinx','flameZ',
  'electronic','b1t','Perfecto','iM','jL','sh1ro','Ax1Le','HObbit','Jame',
  'degster','sdy','Twistzz','NAF','EliGE','Grim','floppy','brehze','YEKINDAR',
  'story','Sonic','hallzerk','k0nfig','XANTARES','woxic','FalleN','KSCERATO',
  'yuurih','dgt','chelo','arT','meyern','luchov','jks','huNter-','HooXi',
  'MalbsMd','skullz','Staehr','roeJ','Lucky','CerQ','Stewie2K','autimatic',
  'Techno','910','bLitz','mzinho','cobrazera','INS','Vexite','nettik','jkaem',
];

function findSlugMatch(query) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRO_SLUGS
    .filter(s => { const sn = s.toLowerCase().replace(/[^a-z0-9]/g,''); return sn.includes(q)||q.includes(sn); })
    .sort((a,b) => {
      const an=a.toLowerCase().replace(/[^a-z0-9]/g,''), bn=b.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(an===q)return -1; if(bn===q)return 1;
      return Math.abs(an.length-q.length)-Math.abs(bn.length-q.length);
    }).slice(0,6);
}

async function scraperFetch(url, js=false) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}${js?'&render=true':''}`,
    { headers: { Accept: 'text/html' } }
  );
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

// Hardcoded HLTV IDs for common DFS players — instant lookup, 0 credits, 0 API calls
const KNOWN_IDS = {
  'niko':{id:'3741',slug:'NiKo'},'zywoo':{id:'11893',slug:'ZywOo'},
  'device':{id:'7592',slug:'device'},'s1mple':{id:'7998',slug:'s1mple'},
  'm0nesy':{id:'19212',slug:'m0NESY'},'ropz':{id:'11816',slug:'ropz'},
  'rain':{id:'8183',slug:'rain'},'karrigan':{id:'429',slug:'karrigan'},
  'twistzz':{id:'10394',slug:'Twistzz'},'naf':{id:'10395',slug:'NAF'},
  'elige':{id:'9816',slug:'EliGE'},'yekindar':{id:'16015',slug:'YEKINDAR'},
  'blamef':{id:'12605',slug:'blameF'},'broky':{id:'16548',slug:'broky'},
  'frozen':{id:'12830',slug:'frozen'},'apex':{id:'7322',slug:'apEX'},
  'fallen':{id:'702',slug:'FalleN'},'dupreeh':{id:'3820',slug:'dupreeh'},
  'magisk':{id:'9332',slug:'Magisk'},'krimz':{id:'4960',slug:'KRIMZ'},
  'techno':{id:'20275',slug:'Techno'},'hunter-':{id:'10907',slug:'huNter-'},
  'jks':{id:'9996',slug:'jks'},'k0nfig':{id:'8399',slug:'k0nfig'},
  'xantares':{id:'12788',slug:'XANTARES'},'grim':{id:'11673',slug:'Grim'},
  'brehze':{id:'10005',slug:'brehze'},'stewie2k':{id:'8979',slug:'Stewie2K'},
  'autimatic':{id:'8190',slug:'autimatic'},'woxic':{id:'11502',slug:'woxic'},
  'electronic':{id:'15449',slug:'electronic'},'b1t':{id:'18998',slug:'b1t'},
  'sh1ro':{id:'18594',slug:'sh1ro'},'ax1le':{id:'18689',slug:'Ax1Le'},
  'jame':{id:'12199',slug:'Jame'},'degster':{id:'12816',slug:'degster'},
  'hampus':{id:'14652',slug:'hampus'},'kscerato':{id:'13968',slug:'KSCERATO'},
  'yuurih':{id:'12345',slug:'yuurih'},'ins':{id:'16747',slug:'INS'},
  'vexite':{id:'18176',slug:'Vexite'},'jkaem':{id:'9874',slug:'jkaem'},
  '910':{id:'12435',slug:'910'},'blitz':{id:'11060',slug:'bLitz'},
  'mzinho':{id:'15719',slug:'mzinho'},'cobrazera':{id:'9033',slug:'cobrazera'},
};

// Bulk player ID map — fetches HLTV stats page once, caches 3 days
// Costs 1 credit per 3 days for ALL players combined
async function getPlayerIdMap() {
  const mapKey = 'hltv_bulk_ids_v2';
  const cached = await kvGet(mapKey);
  if (cached) return cached;
  // HLTV stats players page is server-rendered — no render=true needed (fast)
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now()-180*86400000).toISOString().split('T')[0];
  const html = await scraperFetch(
    `https://www.hltv.org/stats/players?startDate=${start}&endDate=${end}`
  );
  const map = {};
  const rx = /href="\/stats\/players\/(\d+)\/([^"?#\/]+)/gi; let m;
  while((m=rx.exec(html))!==null) { map[m[2].toLowerCase()] = {id:m[1],slug:m[2]}; }
  if (Object.keys(map).length > 5) {
    try {
      await kvSet(mapKey, map, 259200);
    } catch {}
  }
  return map;
}

async function resolveHLTVPlayer(slug) {
  // Level 1: hardcoded table — instant, 0 credits (covers all common DFS players)
  const known = KNOWN_IDS[slug.toLowerCase()];
  if (known) return known;
  const idKey = `hltv_id_${slug.toLowerCase()}`;
  // Level 2: KV cache (instant if previously resolved)
  const cached = await kvGet(idKey);
  if (cached) return cached;
  // Level 3: bulk map fetch (1 credit, cached 3 days)
  const map = await getPlayerIdMap();
  const found = map[slug.toLowerCase()];
  if (!found) throw new Error(`"${slug}" not found — try searching their exact HLTV name`);
  // Cache individual player 7 days
  try {
    await kvSet(idKey, found, 604800);
  } catch {}
  return found;
}

// MAX 3 HS map fetches — 3 credits per player vs 20 before
const MAX_HS = 4;

async function fetchMatchHeadshots(matchUrl, playerSlug) {
  try {
    const html = await scraperFetch(`https://www.hltv.org${matchUrl}`);
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi)||[];
    for (const row of rows) {
      if (row.toLowerCase().includes(playerSlug.toLowerCase())) {
        const hsMatch = row.match(/class="[^"]*gtSmartphone-only[^"]*"[^>]*>\s*\((\d+)\)\s*<\/span>/);
        if (hsMatch) return parseInt(hsMatch[1]);
        const alt = row.match(/>\s*\d+\s*<span[^>]*>\s*\((\d+)\)\s*<\/span>\s*<\/td>/);
        if (alt) return parseInt(alt[1]);
      }
    }
    return 0;
  } catch { return 0; }
}

function parseHLTVMatches(html) {
  const tMatch = html.match(/<table[^>]*stats-matches-table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tMatch) return { games: [] };
  const tHTML = tMatch[1];
  const headers = []; const hRx=/<th[^>]*>([\s\S]*?)<\/th>/gi; let hm;
  while((hm=hRx.exec(tHTML))!==null)
    headers.push(hm[1].replace(/<[^>]+>/g,'').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim().toLowerCase());
  const strippedHeaders = headers.filter(h=>!h.startsWith('t')||h==='team');
  let kdIdx = strippedHeaders.findIndex(h=>h.includes('k')&&h.includes('d')&&h.includes('-'));
  if (kdIdx===-1) kdIdx=4;
  const games=[];
  const rowRx=/<tr[^>]*>([\s\S]*?)<\/tr>/gi; let rowM;
  while((rowM=rowRx.exec(tHTML))!==null){
    const rowHTML=rowM[1];
    if(/<th/i.test(rowHTML)) continue;
    const urlMatch=rowHTML.match(/href="(\/stats\/matches\/mapstatsid\/[^"]+)"/);
    const matchUrl=urlMatch?urlMatch[1].split('?')[0]:null;
    const cells=[]; const cRx=/<td[^>]*>([\s\S]*?)<\/td>/gi; let cm;
    while((cm=cRx.exec(rowHTML))!==null)
      cells.push(cm[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&[^;]+;/g,'').replace(/\s+/g,' ').trim());
    if (cells.length<5) continue;
    const kdMatch=(cells[kdIdx]||'').match(/(\d+)\s*-\s*(\d+)/);
    if (!kdMatch) continue;
    const kills=parseInt(kdMatch[1]), deaths=parseInt(kdMatch[2]);
    if (isNaN(kills)||kills<0||isNaN(deaths)||deaths<0) continue;
    const myScore=parseInt((cells[1]||'').match(/\((\d+)\)/)?.[1]);
    const oppScore=parseInt((cells[2]||'').match(/\((\d+)\)/)?.[1]);
    const win=(!isNaN(myScore)&&!isNaN(oppScore))?myScore>oppScore:null;
    const opp=(cells[2]||'').replace(/\(\d+\)/,'').trim();
    games.push({kills,deaths,assists:0,win,headshots:0,map:cells[3]||'',_date:cells[0]||'',_opp:opp,_matchUrl:matchUrl});
  }
  return { games };
}

function parseHLTVDate(s) {
  const m=s&&s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return new Date(`20${m[3]}-${m[2]}-${m[1]}`);
  return new Date(s);
}

function groupIntoSeries(maps) {
  const series=[]; let i=0;
  while(i<maps.length){
    const cur=maps[i], group=[cur];
    while(i+group.length<maps.length){
      const next=maps[i+group.length];
      const days=Math.abs(parseHLTVDate(cur._date)-parseHLTVDate(next._date))/86400000;
      if(next._opp===cur._opp&&days<=2) group.push(next); else break;
    }
    const wins=group.filter(g=>g.win).length;
    const ordered=[...group].reverse();
    series.push({
      kills:group.reduce((s,g)=>s+g.kills,0),
      deaths:group.reduce((s,g)=>s+g.deaths,0),
      headshots:group.reduce((s,g)=>s+(g.headshots||0),0),
      assists:0,
      win:group.length===1?cur.win:wins>group.length/2,
      maps:ordered.map(g=>({kills:g.kills,deaths:g.deaths,assists:0,headshots:g.headshots||0,map:g.map})),
      _date:cur._date, _opp:cur._opp,
    });
    i+=group.length;
  }
  return series;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if (req.method==='OPTIONS') return res.status(200).end();
  const { action, nickname, playerId, stat } = req.query;

  try {
    if (action==='search') {
      // PRO_SLUGS: free local match (no API call)
      const slugMatches = findSlugMatch(nickname||'');
      if (slugMatches.length)
        return res.json({ players: slugMatches.map(slug=>({id:`hltv_search_${slug}`,name:slug,sub:'Pro · HLTV'})) });
      // GRID: free search for players not in PRO_SLUGS (no credits)
      const GRID_KEY = process.env.GRID_API_KEY;
      if (GRID_KEY) {
        try {
          const safe = (nickname||'').replace(/"/g,'');
          for (const f of [`equals: "${safe}"`, `contains: "${safe}"`]) {
            const gr = await fetch('https://api-op.grid.gg/central-data/graphql', {
              method:'POST', headers:{'Content-Type':'application/json','x-api-key':GRID_KEY},
              body: JSON.stringify({query:`{ players(filter:{nickname:{${f}}},first:5){ edges{node{id nickname title{id} team{id name}}} } }`})
            }).then(r=>r.json());
            const all = gr?.data?.players?.edges?.map(e=>e.node)||[];
            if (!all.length) continue;
            const groups={};
            for(const p of all){const k=p.nickname.toLowerCase();if(!groups[k])groups[k]=[];groups[k].push(p);}
            const players=[];
            for(const profiles of Object.values(groups)){
              const csgo=profiles.find(p=>p.title?.id==='1');
              const cs2=profiles.find(p=>p.title?.id==='28');
              const any=profiles[0];
              const statsId=csgo?.id||cs2?.id||any.id;
              const teamName=cs2?.team?.name||csgo?.team?.name||any.team?.name||'N/A';
              if(statsId) players.push({id:`hltv_search_${any.nickname}`,name:any.nickname,sub:`CS2 · ${teamName}`});
            }
            if(players.length) return res.json({ players });
          }
        } catch {}
      }
      // HLTV search: costs 1 credit — last resort only
      if (SCRAPER_KEY) {
        try {
          const results = await hltvSearch(nickname);
          if (results.length)
            return res.json({ players: results.map(p=>({id:`hltv_${p.id}_${p.slug}`,name:p.display,sub:'Pro · HLTV'})) });
        } catch {}
      }
      if (FACEIT_KEY) {
        const d = await fetch(`${FACEIT_BASE}/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=10`,
          {headers:{Authorization:`Bearer ${FACEIT_KEY}`}}).then(r=>r.json());
        const items=(d.items||[]).filter(p=>parseInt(p.games?.cs2?.skill_level)===10)
          .sort((a,b)=>(parseInt(b.games?.cs2?.faceit_elo)||0)-(parseInt(a.games?.cs2?.faceit_elo)||0)).slice(0,5);
        if (items.length)
          return res.json({ players: items.map(p=>({id:p.player_id,name:p.nickname,sub:`Lvl ${p.games?.cs2?.skill_level} · ELO ${p.games?.cs2?.faceit_elo}`})) });
      }
      return res.json({ players: [] });
    }

    if (action==='gamelog') {
      // Daily cache — separate key for HS so kills lookup costs 1 credit, HS costs +3
      const isHS = stat === 'headshots';
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `hltv3_${playerId}_${today}${isHS ? '_hs' : ''}`;
      const cached = await kvGet(cacheKey);
      if (cached) return res.json({ games: cached });

      if (playerId?.startsWith('hltv_')) {
        if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not set' });
        let hltvId, hltvSlug;
        if (playerId.startsWith('hltv_search_')) {
          const slug=playerId.replace('hltv_search_','');
          const player=await resolveHLTVPlayer(slug);
          hltvId=player.id; hltvSlug=player.slug;
        } else {
          const parts=playerId.split('_'); hltvId=parts[1]; hltvSlug=parts.slice(2).join('_');
        }
        const end=new Date().toISOString().split('T')[0];
        const start=new Date(Date.now()-365*86400000).toISOString().split('T')[0];
        const url=`https://www.hltv.org/stats/players/matches/${hltvId}/${hltvSlug}?startDate=${start}&endDate=${end}`;
        const html=await scraperFetch(url);
        const { games: rawMaps } = parseHLTVMatches(html);
        if (!rawMaps.length) return res.status(404).json({ error:`No match data for ${hltvSlug}` });

        // Only fetch HS when stat=headshots — sequential so all maps in a series get HS
        if (isHS) {
          try {
            const mapsForHS=rawMaps.filter(m=>m._matchUrl).slice(0,MAX_HS);
            const hsResults=await Promise.all(mapsForHS.map(m=>fetchMatchHeadshots(m._matchUrl,hltvSlug)));
            mapsForHS.forEach((m,i)=>{ m.headshots=hsResults[i]; });
          } catch {}
        }

        const games=groupIntoSeries(rawMaps).slice(0,40);
        // HS cached 7 days, kills cached 24hr
        await kvSet(cacheKey, games, isHS ? 604800 : CACHE_TTL);
        return res.json({ games });
      }

      // FACEIT fallback
      if (FACEIT_KEY) {
        const history=await fetch(`${FACEIT_BASE}/players/${playerId}/history?game=cs2&limit=20`,
          {headers:{Authorization:`Bearer ${FACEIT_KEY}`}}).then(r=>r.json());
        const games=(await Promise.all((history.items||[]).slice(0,15).map(async m=>{
          try {
            const stats=await fetch(`${FACEIT_BASE}/matches/${m.match_id}/stats`,
              {headers:{Authorization:`Bearer ${FACEIT_KEY}`}}).then(r=>r.json());
            const team=stats.rounds?.[0]?.teams?.find(t=>t.players?.some(p=>p.player_id===playerId));
            const player=team?.players?.find(p=>p.player_id===playerId);
            if (!player) return null;
            const k=parseInt(player.player_stats?.Kills||0), d=parseInt(player.player_stats?.Deaths||0);
            return {kills:k,deaths:d,assists:parseInt(player.player_stats?.Assists||0),headshots:0,
              win:team.team_stats?.['Team Win']==='1',
              _date:new Date(m.finished_at*1000).toISOString().split('T')[0],_opp:'',
              maps:[{kills:k,deaths:d,assists:0,headshots:0,map:''}]};
          } catch { return null; }
        }))).filter(Boolean);
        kvSet(cacheKey, games);
        return res.json({ games });
      }
      return res.json({ games: [] });
    }

    return res.status(400).json({ error:'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
