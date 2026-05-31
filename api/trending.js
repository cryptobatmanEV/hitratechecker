export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Confirmed PrizePicks league IDs — main leagues only, no SZN/series/splits
const PP_LEAGUE = { nba:'7', wnba:'3', mlb:'2', nhl:'8', lol:'121', dota:'174' };

// PP stat_type string → game log calc function per sport
const CALCS = {
  nba: {
    'Points':         g=>g.pts,
    'Rebounds':       g=>g.reb,
    'Assists':        g=>g.ast,
    'Steals':         g=>g.stl,
    'Blocks':         g=>g.blk,
    '3-Pt Made':      g=>g.fg3m,
    'Turnovers':      g=>g.tov,
    'Pts+Rebs+Asts':  g=>(g.pts||0)+(g.reb||0)+(g.ast||0),
    'Blks+Stls':      g=>(g.blk||0)+(g.stl||0),
    'Rebs+Asts':      g=>(g.reb||0)+(g.ast||0),
    'Pts+Rebs':       g=>(g.pts||0)+(g.reb||0),
    'Pts+Asts':       g=>(g.pts||0)+(g.ast||0),
    'FG Made':        g=>g.fgm,
    'FT Made':        g=>g.ftm,
    'FT Attempts':    g=>g.fta,
  },
  mlb: {
    'Hits':                g=>g.stat?.hits,
    'Singles':             g=>{const s=g.stat||{};return(s.hits||0)-(s.doubles||0)-(s.triples||0)-(s.homeRuns||0);},
    'Total Bases':         g=>{const s=g.stat||{};const sg=(s.hits||0)-(s.doubles||0)-(s.triples||0)-(s.homeRuns||0);return sg+2*(s.doubles||0)+3*(s.triples||0)+4*(s.homeRuns||0);},
    'Home Runs':           g=>g.stat?.homeRuns,
    'RBIs':                g=>g.stat?.rbi,
    'Runs Scored':         g=>g.stat?.runs,
    'Stolen Bases':        g=>g.stat?.stolenBases,
    'Walks':               g=>g.stat?.baseOnBalls,
    'Strikeouts':          g=>g.stat?.strikeOuts,
    'Pitcher Strikeouts':  g=>g.stat?.strikeOuts,
    'Pitching Outs':       g=>{const p=(g.stat?.inningsPitched||'0').toString().split('.');return parseInt(p[0])*3+(parseInt(p[1])||0);},
    'Hits Allowed':        g=>g.stat?.hits,
    'Earned Runs Allowed': g=>g.stat?.earnedRuns,
    'Walks Allowed':       g=>g.stat?.baseOnBalls,
  },
  nhl: {
    'Goals':         g=>g.stat?.goals,
    'Assists':       g=>g.stat?.assists,
    'Points':        g=>(g.stat?.goals||0)+(g.stat?.assists||0),
    'Shots On Goal': g=>g.stat?.shots,
    'Saves':         g=>g.stat?.saves,
    'Goals Against': g=>g.stat?.goalsAgainst,
  },
  lol:  { 'Kills':g=>g.kills, 'Deaths':g=>g.deaths, 'Assists':g=>g.assists, 'CS':g=>g.cs },
  dota: { 'Kills':g=>g.kills, 'Deaths':g=>g.deaths, 'Assists':g=>g.assists, 'GPM':g=>g.gpm, 'XPM':g=>g.xpm },
};
CALCS.wnba = CALCS.nba;

const PITCHING_STATS = new Set(['Pitcher Strikeouts','Pitching Outs','Hits Allowed','Earned Runs Allowed','Walks Allowed']);

function norm(n){ return (n||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim(); }

function hitRates(games, fn, line) {
  const vals = games.map(g=>{try{const v=fn(g);return(v!=null&&!isNaN(v)&&v>=0)?v:null;}catch{return null;}}).filter(v=>v!=null);
  if(!vals.length) return null;
  const calc = n => {
    const s=vals.slice(0,n); if(!s.length) return null;
    const h=s.filter(v=>v>line).length;
    return {hits:h,total:s.length,pct:Math.round(h/s.length*100),avg:Math.round(s.reduce((a,b)=>a+b,0)/s.length*10)/10};
  };
  return {l5:calc(5),l10:calc(10),l30:calc(30)};
}

async function fetchPP(leagueId) {
  const r = await fetch(`https://api.prizepicks.com/projections?league_id=${leagueId}&per_page=250&single_stat=true`,
    {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
  if(!r.ok) throw new Error(`PrizePicks API ${r.status}`);
  return r.json();
}

async function findPlayerId(name, sport, host) {
  try {
    const n=norm(name);
    if(sport==='lol'||sport==='dota') {
      const r=await fetch(`https://${host}/api/${sport}?action=search&q=${encodeURIComponent(name)}`);
      const d=await r.json();
      return (Array.isArray(d)&&d.find(p=>norm(p.name)===n)||d?.[0])?.id||null;
    }
    if(sport==='nba'||sport==='wnba') {
      const r=await fetch(`https://${host}/api/${sport}?action=search&q=${encodeURIComponent(name)}`);
      const d=await r.json();
      return (Array.isArray(d)&&d.find(p=>norm(p.name)===n)||d?.[0])?.id||null;
    }
    if(sport==='mlb') {
      const r=await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}&sportId=1&active=true`);
      const d=await r.json();
      return ((d.people||[]).find(p=>norm(p.fullName)===n)||(d.people||[])[0])?.id?.toString()||null;
    }
    if(sport==='nhl') {
      const r=await fetch(`https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player&sport=hockey&league=nhl`,
        {headers:{'User-Agent':UA}});
      const d=await r.json();
      return ((d.items||[]).find(p=>norm(p.displayName)===n)||(d.items||[])[0])?.id||null;
    }
  } catch {}
  return null;
}

async function fetchLog(id, sport, host) {
  try {
    if(sport==='mlb') {
      const s=new Date().getFullYear();
      const [hr,pr]=await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=${s}&sportId=1&group=hitting`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=${s}&sportId=1&group=pitching`),
      ]);
      const [hd,pd]=await Promise.all([hr.json(),pr.json()]);
      return {
        hitting:(hd.stats?.[0]?.splits||[]).map(x=>({stat:x.stat,_date:x.date})).reverse(),
        pitching:(pd.stats?.[0]?.splits||[]).map(x=>({stat:x.stat,_date:x.date})).reverse(),
      };
    }
    if(sport==='nhl') {
      const r=await fetch(`https://${host}/api/nhl?action=gamelog&id=${id}`);
      return r.ok?await r.json():[];
    }
    const r=await fetch(`https://${host}/api/${sport}?action=gamelog&id=${id}&scope=season`);
    return r.ok?await r.json():[];
  } catch { return sport==='mlb'?{hitting:[],pitching:[]}:[]; }
}

export default async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=300,stale-while-revalidate=60');

  const {sport='nba'}=req.query;
  const lid=PP_LEAGUE[sport];
  if(!lid) return res.status(400).json({error:'Unsupported sport'});

  const host=req.headers.host;
  const calcs=CALCS[sport];
  if(!calcs) return res.status(400).json({error:'No stat config for sport'});

  try {
    const ppData=await fetchPP(lid);

    // Build player lookup from included resources
    const players={};
    for(const inc of ppData.included||[]) {
      if(inc.type==='new_player') {
        players[inc.id]={name:inc.attributes?.display_name||inc.attributes?.name,team:inc.attributes?.team};
      }
    }

    // Parse projections — only ones we have calc functions for
    const projs=(ppData.data||[])
      .filter(p=>p.type==='projection'&&p.attributes?.status!=='closed')
      .map(p=>{
        const pid=p.relationships?.new_player?.data?.id;
        const pl=players[pid]||{};
        return {name:pl.name,team:pl.team,stat:p.attributes?.stat_type,line:parseFloat(p.attributes?.line_score)||0};
      })
      .filter(p=>p.name&&p.stat&&p.line>0&&calcs[p.stat]);

    // Unique players (cap at 25 for performance)
    const seen=new Set(), unique=[];
    for(const p of projs) { if(!seen.has(p.name)&&unique.length<25){seen.add(p.name);unique.push(p.name);} }

    // Parallel: find player IDs
    const idMap={};
    await Promise.all(unique.map(async name=>{
      const id=await findPlayerId(name,sport,host);
      if(id) idMap[name]=id;
    }));

    // Parallel: fetch game logs
    const logMap={};
    await Promise.all(Object.entries(idMap).map(async([name,id])=>{
      logMap[name]=await fetchLog(id,sport,host);
    }));

    // Calculate hit rates for every projection
    const results=[];
    for(const proj of projs) {
      const log=logMap[proj.name];
      if(!log) continue;
      let games=log;
      if(sport==='mlb') games=PITCHING_STATS.has(proj.stat)?log.pitching:log.hitting;
      if(!Array.isArray(games)||!games.length) continue;
      const r=hitRates(games,calcs[proj.stat],proj.line);
      if(!r?.l10?.total) continue;
      results.push({player:proj.name,team:proj.team,stat:proj.stat,line:proj.line,l5:r.l5,l10:r.l10,l30:r.l30});
    }

    // Sort by L10%, top 20
    const top20=results.sort((a,b)=>(b.l10?.pct||0)-(a.l10?.pct||0)).slice(0,20);
    return res.json({sport,updated:new Date().toISOString(),results:top20});

  } catch(e) { return res.status(500).json({error:e.message}); }
}
