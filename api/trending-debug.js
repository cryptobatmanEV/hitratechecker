export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gp(q, v={}) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error:'no GRID_API_KEY' };
  const r = await fetch(GRID_URL, { method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ query:q, variables:v }) });
  const t = await r.text();
  let j; try{j=JSON.parse(t);}catch{j={raw:t.slice(0,200)};}
  return { status:r.status, data:j?.data, errors:j?.errors };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='nhl' } = req.query;
  const host = req.headers.host;
  const out = { sport };

  // ── NHL ──────────────────────────────────────────────────────────────────────
  if (sport === 'nhl') {
    const pp = await fetch('https://api.prizepicks.com/projections?league_id=8&per_page=20',
      {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
    const ppd = await pp.json();
    const projs = (ppd.data||[]).filter(p=>p.type==='projection');
    const pMap = {};
    for (const i of ppd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name};
    const sample = projs[0];
    const sName = pMap[sample?.relationships?.new_player?.data?.id]?.name;
    out.pp = { count: projs.length, sample_stat: sample?.attributes?.stat_type, sample_name: sName };

    if (sName) {
      const sr = await fetch(`https://${host}/api/nhl?action=search&q=${encodeURIComponent(sName)}`);
      const sd = await sr.json();
      const players = Array.isArray(sd)?sd:(sd.players||[]);
      out.nhl_search = { status: sr.status, count: players.length, first: players[0] };

      if (players[0]) {
        const gr = await fetch(`https://${host}/api/nhl?action=gamelog&playerId=${players[0].id}`);
        const gd = await gr.json();
        const games = Array.isArray(gd)?gd:(gd.games||[]);
        out.nhl_gamelog = { status: gr.status, count: games.length, sample: games[0] };
      }
    }
  }

  // ── LoL scope ──────────────────────────────────────────────────────────────
  if (sport === 'lol') {
    const pp = await fetch('https://api.prizepicks.com/projections?league_id=121&per_page=100',
      {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
    const ppd = await pp.json();
    const pMap = {};
    for (const i of ppd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name};
    const allProjs = (ppd.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed');
    const maps13 = allProjs.filter(p=>/^MAPS\s+1-3\b/i.test(p.attributes?.stat_type||''));
    out.pp_total = allProjs.length;
    out.pp_maps13_count = maps13.length;
    out.pp_all_stat_types = [...new Set(allProjs.map(p=>p.attributes?.stat_type))];
    out.pp_maps13_players = maps13.slice(0,3).map(p=>pMap[p.relationships?.new_player?.data?.id]?.name);

    // Test search + gamelog for one maps1-3 player
    const testName = out.pp_maps13_players[0];
    if (testName) {
      const sr = await fetch(`https://${host}/api/lol?action=search&name=${encodeURIComponent(testName)}`);
      const sd = await sr.json();
      const players = Array.isArray(sd)?sd:(sd.players||[]);
      const p = players.find(x=>(x.name||'').toLowerCase()===testName.toLowerCase())||players[0];
      out.lol_search = { searched: testName, status: sr.status, found: !!p, player: p };

      if (p) {
        const pn = p.playerName||p.name;
        const url = `https://${host}/api/lol?action=gamelog&teamId=${p.teamId}&teamCode=${p.teamCode||''}&leagueName=${encodeURIComponent(p.leagueName||'')}&playerName=${encodeURIComponent(pn)}&name=${encodeURIComponent(pn)}`;
        const gr = await fetch(url);
        const gd = await gr.json();
        const games = Array.isArray(gd)?gd:(gd.games||[]);
        const has3Maps = games.filter(g=>g.maps?.length>=3).length;
        out.lol_gamelog = { status: gr.status, total_games: games.length, games_with_3maps: has3Maps, sample: games[0] };
      }
    }
  }

  // ── CS2 batch ─────────────────────────────────────────────────────────────
  if (sport === 'cs2') {
    out.grid_key = !!process.env.GRID_API_KEY;
    const result = await gp(`
      query { allSeries(orderBy:STARTTIME_DESC first:10) {
        nodes { id startTime type
          games { nodes { teams { nodes { players { nodes { nickname kills } } } } } }
        }
      }}`);
    const nodes = result.data?.allSeries?.nodes||[];
    out.series_total = nodes.length;
    out.series_types = [...new Set(nodes.map(n=>n.type))];
    out.esports_series = nodes.filter(n=>n.type==='ESPORTS').length;
    out.sample_players_in_first_esports = nodes.filter(n=>n.type==='ESPORTS').slice(0,2).map(s=>({
      id: s.id,
      games: s.games?.nodes?.map(g=>g.teams?.nodes?.map(t=>t.players?.nodes?.map(p=>p.nickname))),
    }));
    out.errors = result.errors;
  }

  return res.json(out);
}
