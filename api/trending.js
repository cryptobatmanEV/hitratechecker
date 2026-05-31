export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Main leagues only — no SZN/series/splits
const PP_LEAGUE = { nba:'7', wnba:'3', mlb:'2', nhl:'8', lol:'121', dota:'174', cs2:'265' };

const PITCHING_STATS = new Set([
  'Pitcher Strikeouts','Pitching Outs','Hits Allowed','Earned Runs Allowed','Walks Allowed'
]);

const CALCS = {
  nba: {
    'Points':g=>g.pts, 'Rebounds':g=>g.reb, 'Assists':g=>g.ast,
    'Steals':g=>g.stl, 'Blocks':g=>g.blk, '3-Pt Made':g=>g.fg3m,
    'Turnovers':g=>g.tov, 'FG Made':g=>g.fgm, 'FT Made':g=>g.ftm,
    'FT Attempts':g=>g.fta,
    'Pts+Rebs+Asts':g=>(g.pts||0)+(g.reb||0)+(g.ast||0),
    'Blks+Stls':g=>(g.blk||0)+(g.stl||0),
    'Rebs+Asts':g=>(g.reb||0)+(g.ast||0),
    'Pts+Rebs':g=>(g.pts||0)+(g.reb||0),
    'Pts+Asts':g=>(g.pts||0)+(g.ast||0),
  },
  mlb: {
    'Hits':g=>g.stat?.hits,
    'Singles':g=>{const s=g.stat||{};return(s.hits||0)-(s.doubles||0)-(s.triples||0)-(s.homeRuns||0);},
    'Total Bases':g=>{const s=g.stat||{};const sg=(s.hits||0)-(s.doubles||0)-(s.triples||0)-(s.homeRuns||0);return sg+2*(s.doubles||0)+3*(s.triples||0)+4*(s.homeRuns||0);},
    'Home Runs':g=>g.stat?.homeRuns,'RBIs':g=>g.stat?.rbi,
    'Runs Scored':g=>g.stat?.runs,'Stolen Bases':g=>g.stat?.stolenBases,
    'Walks':g=>g.stat?.baseOnBalls,'Strikeouts':g=>g.stat?.strikeOuts,
    'Pitcher Strikeouts':g=>g.stat?.strikeOuts,
    'Pitching Outs':g=>{const p=(g.stat?.inningsPitched||'0').toString().split('.');return parseInt(p[0])*3+(parseInt(p[1])||0);},
    'Hits Allowed':g=>g.stat?.hits,
    'Earned Runs Allowed':g=>g.stat?.earnedRuns,
    'Walks Allowed':g=>g.stat?.baseOnBalls,
  },
  nhl: {
    'Goals':g=>g.stat?.goals,'Assists':g=>g.stat?.assists,
    'Points':g=>(g.stat?.goals||0)+(g.stat?.assists||0),
    'Shots On Goal':g=>g.stat?.shots,'Saves':g=>g.stat?.saves,
    'Goals Against':g=>g.stat?.goalsAgainst,
  },
  // LoL: PP uses "MAP N StatName" or "MAPS N-M StatName" — resolved dynamically below
  lol: {
    'Kills':g=>g.kills,'Deaths':g=>g.deaths,'Assists':g=>g.assists,
    'CS':g=>g.cs,'Creep Score':g=>g.cs,'CS (Creep Score)':g=>g.cs,
  },
  // Dota: same map-range pattern — series totals used as proxy (no per-map data)
  dota: {
    'Kills':g=>g.kills,'Deaths':g=>g.deaths,'Assists':g=>g.assists,
    'GPM':g=>g.gpm,'Gold Per Minute':g=>g.gpm,
    'XPM':g=>g.xpm,'Experience Per Minute':g=>g.xpm,
  },
  // CS2: kills only via GRID (free, no credits)
  cs2: {
    'Kills':g=>g.kills,
  },
};
CALCS.wnba = CALCS.nba;

// Dynamically resolve PP stat types that include map prefixes
// e.g. "MAP 4 Kills" → g.maps[3].kills
// e.g. "MAPS 1-2 Kills" → g.maps[0].kills + g.maps[1].kills
// Falls back to series total for Dota (no per-map data in game log)
const BASE_STAT = {
  Kills:   (g, maps) => maps ? maps.reduce((s,m)=>s+(m?.kills||0),0)   : (g.kills||0),
  Deaths:  (g, maps) => maps ? maps.reduce((s,m)=>s+(m?.deaths||0),0)  : (g.deaths||0),
  Assists: (g, maps) => maps ? maps.reduce((s,m)=>s+(m?.assists||0),0) : (g.assists||0),
  CS:      (g, maps) => maps ? maps.reduce((s,m)=>s+(m?.cs||0),0)      : (g.cs||0),
  GPM:     (g)       => g.gpm||0,
  XPM:     (g)       => g.xpm||0,
};

function resolveStatFn(sport, statType) {
  const direct = CALCS[sport]?.[statType];
  if (direct) return direct;

  // Strip "(Combo)" and similar suffixes PP sometimes appends
  const cleanType = statType.replace(/\s*\([^)]+\)\s*$/, '').trim();
  if (cleanType !== statType && CALCS[sport]?.[cleanType]) return CALCS[sport][cleanType];

  // Parse "MAP N StatName" — e.g. "MAP 4 Kills"
  const single = (cleanType).match(/^MAP\s+(\d+)\s+(.+)$/i);
  if (single) {
    const idx = parseInt(single[1]) - 1;
    const base = BASE_STAT[single[2].trim()];
    if (!base) return null;
    if (sport === 'lol') return g => {
      // Return null if this map wasn't played — excludes the game from hit rate calc
      if (!g.maps || g.maps.length <= idx) return null;
      return base(g, [g.maps[idx]]);
    };
    return g => base(g, null); // dota: use series total
  }

  // Parse "MAPS N-M StatName" — e.g. "MAPS 1-3 Kills"
  const range = (cleanType).match(/^MAPS\s+(\d+)-(\d+)\s+(.+)$/i);
  if (range) {
    const from    = parseInt(range[1]) - 1;
    const to      = parseInt(range[2]) - 1;
    const mapsNeeded = to - from + 1;
    const base    = BASE_STAT[range[3].trim()];
    if (!base) return null;
    if (sport === 'lol') return g => {
      // Only count games where enough maps were actually played
      if (!g.maps || g.maps.length < mapsNeeded) return null;
      const maps = g.maps.slice(from, to + 1);
      return base(g, maps);
    };
    // Dota: no per-map breakdown — use series total as proxy
    return g => base(g, null);
  }

  return null;
}

// ── GRID helpers (CS2 — free, no ScraperAPI) ──────────────────────────────────
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gridPost(query, variables) {
  const key = process.env.GRID_API_KEY;
  if (!key) throw new Error('GRID_API_KEY not set');
  const r = await fetch(GRID_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`GRID ${r.status}`);
  const d = await r.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.data;
}

async function findCS2Player(name) {
  const n = norm(name);
  // GRID schema uses `players` (not allPlayers) with edges/node pattern
  for (const filterVal of [name, `%${name}%`]) {
    for (const op of ['eq','equalTo','like','ilike']) {
      try {
        const data = await gridPost(`
          query SearchPlayer($val: String!) {
            players(filter:{nickname:{${op}:$val}} first:8) {
              edges { node { id nickname } }
            }
          }
        `, { val: filterVal });
        const list=(data?.players?.edges||[]).map(e=>e.node).filter(Boolean);
        if(list.length) return list.find(p=>norm(p.nickname)===n)||list[0]||null;
      } catch {}
    }
  }
  return null;
}

async function getCS2KillLog(playerId) {
  // Fetch recent series, sum kills per series (matches PP's per-match prop)
  const data = await gridPost(`
    query PlayerSeries($pid: Long!) {
      allSeries(
        filter: {
          hasRosterWithPlayers: { playerId: { equalTo: $pid } }
          type: { equalTo: ESPORTS }
        }
        orderBy: STARTTIME_DESC
        first: 30
      ) {
        nodes {
          id
          startTime
          games {
            nodes {
              teams {
                nodes {
                  homeTeam
                  name
                  players {
                    nodes { playerId kills }
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { pid: parseInt(playerId) });

  const series = data?.allSeries?.nodes || [];
  // allSeries is confirmed working in cs2.js — only allPlayers was wrong
  const games = [];

  for (const s of series) {
    let totalKills = 0, found = false;
    for (const ge of (s.games?.edges || [])) {
      const g = ge.node;
      for (const te of (g?.teams?.edges || [])) {
        const t = te.node;
        for (const pe of (t?.players?.edges || [])) {
          const p = pe.node;
          if (String(p?.playerId) === String(playerId)) {
            totalKills += p.kills || 0;
            found = true;
          }
        }
      }
    }
    if (found) games.push({ kills: totalKills, _date: (s.startTime||'').slice(0,10) });
  }
  return games;
}

// ── Generic helpers ────────────────────────────────────────────────────────────
function norm(n) {
  return (n||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();
}

function hitRates(games, fn, line) {
  const vals = games.map(g=>{try{const v=fn(g);return(v!=null&&!isNaN(v)&&v>=0)?v:null;}catch{return null;}}).filter(v=>v!=null);
  if (!vals.length) return null;
  const calc = (n, dir) => {
    const s = vals.slice(0,n); if (!s.length) return null;
    const h = dir==='over' ? s.filter(v=>v>line).length : s.filter(v=>v<line).length;
    return { hits:h, total:s.length, pct:Math.round(h/s.length*100), avg:Math.round(s.reduce((a,b)=>a+b,0)/s.length*10)/10 };
  };
  // Pick whichever direction has better L10 hit rate
  const overL10 = calc(10,'over');
  const underL10 = calc(10,'under');
  const dir = (overL10?.pct||0) >= (underL10?.pct||0) ? 'over' : 'under';
  return { direction:dir, l5:calc(5,dir), l10:calc(10,dir), l30:calc(30,dir) };
}

async function fetchPP(leagueId) {
  const url = `https://api.prizepicks.com/projections?league_id=${leagueId}&per_page=250`;
  const headers = { Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r=>setTimeout(r, 1000 * attempt));
    const r = await fetch(url, { headers });
    if (r.status === 429) continue; // retry after delay
    if (!r.ok) throw new Error(`PrizePicks ${r.status}`);
    return r.json();
  }
  throw new Error('PrizePicks rate limited — try again in a few seconds');
}

async function findPlayer(name, sport, host) {
  try {
    const n = norm(name);
    if (sport === 'cs2') {
      const p = await findCS2Player(name);
      return p || null;
    }
    if (sport === 'lol') {
      const r = await fetch(`https://${host}/api/lol?action=search&name=${encodeURIComponent(name)}`);
      if (!r.ok) return null; // lol.js throws 500 when player not found — skip gracefully
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.players||[]);
      return list.find(p=>norm(p.name)===n) || list[0] || null;
    }
    if (sport === 'dota') {
      const r = await fetch(`https://${host}/api/dota?action=search&q=${encodeURIComponent(name)}`);
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.players||[]);
      return list.find(p=>norm(p.name)===n) || list[0] || null;
    }
    if (sport === 'nba' || sport === 'wnba') {
      const r = await fetch(`https://${host}/api/${sport}?action=search&q=${encodeURIComponent(name)}`);
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.players||[]);
      return list.find(p=>norm(p.name)===n) || list[0] || null;
    }
    if (sport === 'mlb') {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}&sportId=1&active=true`);
      const d = await r.json();
      const list = d.people||[];
      const match = list.find(p=>norm(p.fullName)===n) || list[0];
      return match ? { id:String(match.id), name:match.fullName } : null;
    }
    if (sport === 'nhl') {
      const r = await fetch(`https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player&sport=hockey&league=nhl`,
        { headers:{'User-Agent':UA} });
      const d = await r.json();
      const list = d.items||[];
      return list.find(p=>norm(p.displayName)===n) || list[0] || null;
    }
  } catch {}
  return null;
}

async function fetchLog(player, sport, host) {
  try {
    if (sport === 'cs2') {
      return await getCS2KillLog(player.id);
    }
    if (sport === 'mlb') {
      const s = new Date().getFullYear();
      const [hr0,pr0,hr1,pr1] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${player.id}/stats?stats=gameLog&season=${s}&sportId=1&group=hitting`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player.id}/stats?stats=gameLog&season=${s}&sportId=1&group=pitching`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player.id}/stats?stats=gameLog&season=${s-1}&sportId=1&group=hitting`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player.id}/stats?stats=gameLog&season=${s-1}&sportId=1&group=pitching`),
      ]);
      const [hd0,pd0,hd1,pd1] = await Promise.all([hr0.json(),pr0.json(),hr1.json(),pr1.json()]);
      const toG = (d) => (d.stats?.[0]?.splits||[]).map(x=>({stat:x.stat,_date:x.date})).reverse();
      return { hitting:[...toG(hd0),...toG(hd1)], pitching:[...toG(pd0),...toG(pd1)] };
    }
    if (sport === 'lol') {
      const { teamId,teamCode,leagueName,playerName,name } = player;
      const pn = playerName||name||'';
      const url = `https://${host}/api/lol?action=gamelog&teamId=${encodeURIComponent(teamId||'')}&teamCode=${encodeURIComponent(teamCode||'')}&leagueName=${encodeURIComponent(leagueName||'')}&playerName=${encodeURIComponent(pn)}&name=${encodeURIComponent(pn)}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : (d.games||[]);
    }
    if (sport === 'dota') {
      const url = `https://${host}/api/dota?action=gamelog&id=${encodeURIComponent(player.id||player.account_id||'')}&scope=season&teamId=${encodeURIComponent(player.teamId||'')}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : (d.games||[]);
    }
    if (sport === 'nhl') {
      const r = await fetch(`https://${host}/api/nhl?action=gamelog&playerId=${encodeURIComponent(player.id||player.playerId||'')}`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : (d.games||[]);
    }
    // nba, wnba
    const r = await fetch(`https://${host}/api/${sport}?action=gamelog&id=${encodeURIComponent(player.id||'')}&scope=season`);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : (d.games||[]);
  } catch {
    return sport === 'mlb' ? { hitting:[], pitching:[] } : [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Debug mode: ?debug=1 — tests one player end-to-end, shows raw data
  if (req.query.debug === '1') {
    const sport = req.query.sport || 'lol';
    const host  = req.headers.host;
    const out   = { sport, steps: {} };
    try {
      // Step 1: PP projections
      const ppData = await fetchPP(PP_LEAGUE[sport]);
      const rawProjs = (ppData.data||[]).filter(p=>p.type==='projection');
      const pMap2 = {};
      for (const inc of ppData.included||[]) {
        if (inc.type==='new_player'||inc.type==='player') {
          pMap2[inc.id] = { name:inc.attributes?.display_name||inc.attributes?.name, team:inc.attributes?.team };
        }
      }
      const sampleProj = rawProjs[0];
      const samplePlayer = sampleProj ? pMap2[sampleProj.relationships?.new_player?.data?.id] : null;
      out.steps.pp = {
        raw_count: rawProjs.length,
        sample_stat_type: sampleProj?.attributes?.stat_type,
        sample_line: sampleProj?.attributes?.line_score,
        sample_player_name: samplePlayer?.name,
        resolves_to_fn: sampleProj ? !!resolveStatFn(sport, sampleProj.attributes?.stat_type) : false,
      };

      // Step 2: Player search for first player
      const testName = samplePlayer?.name;
      if (testName) {
        const found = await findPlayer(testName, sport, host).catch(e=>({ error: e.message }));
        out.steps.player_search = { searched: testName, result: found };

        // Step 3: Game log for found player
        if (found && !found.error) {
          const log = await fetchLog(found, sport, host).catch(e=>({ error: e.message }));
          const games = Array.isArray(log) ? log : (log?.games || log?.hitting || []);
          out.steps.game_log = {
            type: Array.isArray(log) ? 'array' : typeof log,
            length: Array.isArray(games) ? games.length : '?',
            sample_game: games[0] || null,
            has_maps: games[0] ? !!games[0].maps : false,
            maps_length: games[0]?.maps?.length,
          };

          // Step 4: Hit rate calc test
          if (games.length && sampleProj) {
            const fn = resolveStatFn(sport, sampleProj.attributes?.stat_type);
            const testVal = fn ? (() => { try { return fn(games[0]); } catch(e) { return { error: e.message }; } })() : 'no fn';
            out.steps.calc_test = {
              stat_type: sampleProj.attributes?.stat_type,
              line: parseFloat(sampleProj.attributes?.line_score),
              first_game_value: testVal,
            };
          }
        }
      }
    } catch(e) { out.error = e.message; }
    return res.json(out);
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300,stale-while-revalidate=60');

  const { sport='nba' } = req.query;
  const lid = PP_LEAGUE[sport];
  if (!lid) return res.status(400).json({ error:'Unsupported sport' });

  const host = req.headers.host;
  const calcs = CALCS[sport];
  if (!calcs) return res.status(400).json({ error:'No stat config for sport' });

  try {
    const ppData = await fetchPP(lid);

    // PP uses 'new_player' for most sports but may differ for esports
    const pMap = {};
    for (const inc of ppData.included||[]) {
      if (inc.type==='new_player' || inc.type==='player' || inc.type==='esports_player') {
        pMap[inc.id] = {
          name: inc.attributes?.display_name || inc.attributes?.name || inc.attributes?.nickname,
          team: inc.attributes?.team || inc.attributes?.team_name,
        };
      }
    }

    const projs = (ppData.data||[])
      .filter(p=>p.type==='projection'&&p.attributes?.status!=='closed')
      .map(p=>{
        const pid = p.relationships?.new_player?.data?.id;
        const pl = pMap[pid]||{};
        return { name:pl.name, team:pl.team, stat:p.attributes?.stat_type, line:parseFloat(p.attributes?.line_score)||0 };
      })
      .filter(p=>p.name&&p.stat&&p.line>0&&resolveStatFn(sport,p.stat));

    // Debug: what types are in included? Helps find esports player type key
    const includedTypes = [...new Set((ppData.included||[]).map(i=>i.type))];
    const rawProjCount = (ppData.data||[]).filter(p=>p.type==='projection').length;
    const sampleRawProj = (ppData.data||[]).find(p=>p.type==='projection');
    const sampleIncluded = (ppData.included||[]).slice(0,2);

    if (!projs.length) return res.json({
      sport, updated:new Date().toISOString(), results:[],
      debug: {
        note: 'No projections matched — check included_types and sample_proj below',
        raw_proj_count: rawProjCount,
        included_types: includedTypes,
        pmap_size: Object.keys(pMap).length,
        sample_proj: sampleRawProj ? {
          type: sampleRawProj.type,
          status: sampleRawProj.attributes?.status,
          stat_type: sampleRawProj.attributes?.stat_type,
          line: sampleRawProj.attributes?.line_score,
          player_rel: sampleRawProj.relationships?.new_player?.data,
          description: sampleRawProj.attributes?.description,
        } : null,
        sample_included: sampleIncluded.map(i=>({type:i.type, id:i.id, attrs:i.attributes})),
        calcs_keys: Object.keys(CALCS[sport]||{}),
      }
    });

    const seen=new Set(), unique=[];
    for (const p of projs) { if (!seen.has(p.name)&&unique.length<25){ seen.add(p.name); unique.push(p.name); } }

    const playerObjs = {};
    await Promise.all(unique.map(async name => {
      const p = await findPlayer(name, sport, host).catch(()=>null);
      if (p) playerObjs[name] = p;
    }));

    const logMap = {};
    await Promise.all(Object.entries(playerObjs).map(async ([name,p]) => {
      logMap[name] = await fetchLog(p, sport, host).catch(()=>sport==='mlb'?{hitting:[],pitching:[]}:[]);
    }));

    const results = [];
    for (const proj of projs) {
      const log = logMap[proj.name];
      if (!log) continue;
      let games = log;
      if (sport==='mlb') games = PITCHING_STATS.has(proj.stat) ? log.pitching : log.hitting;
      if (!Array.isArray(games)||!games.length) continue;
      const statFn = resolveStatFn(sport, proj.stat); if (!statFn) continue;
      const r = hitRates(games, statFn, proj.line);
      if (!r?.l10) continue;
      results.push({ player:proj.name, team:proj.team, stat:proj.stat, line:proj.line, direction:r.direction, l5:r.l5, l10:r.l10, l30:r.l30 });
    }

    const top20 = results.sort((a,b)=>(b.l10?.pct||0)-(a.l10?.pct||0)).slice(0,20);
    const seenStats=[...new Set(projs.map(p=>p.stat))];
    return res.json({
      sport,
      updated: new Date().toISOString(),
      results: top20,
      debug: {
        pp_total: (ppData.data||[]).filter(p=>p.type==='projection').length,
        pp_stat_matched: projs.length,
        stats_from_pp: seenStats,
        players_found: unique.length,
        players_id_matched: Object.keys(playerObjs).length,
        players_unmatched: unique.filter(n=>!playerObjs[n]).slice(0,5),
        players_empty_log: Object.entries(logMap).filter(([,l])=>!Array.isArray(l)||!l.length).map(([n])=>n).slice(0,5),
        results_count: results.length,
      }
    });

  } catch(e) { return res.status(500).json({ error:e.message }); }
}
