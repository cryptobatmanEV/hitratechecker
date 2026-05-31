export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='dota' } = req.query;
  const host = req.headers.host;
  const out = { sport, host };

  if (sport === 'dota') {
    // Step 1: get a real PP Dota player name
    const pp = await fetch('https://api.prizepicks.com/projections?league_id=174&per_page=20',
      {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
    const ppd = await pp.json();
    const pMap = {};
    for(const i of ppd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name};
    const firstProj = (ppd.data||[]).find(p=>p.type==='projection');
    const testName = pMap[firstProj?.relationships?.new_player?.data?.id]?.name || 'Yatoro';
    out.pp_test_player = testName;

    // Step 2: test dota search
    const t1 = Date.now();
    const sr = await fetch(`https://${host}/api/dota?action=search&q=${encodeURIComponent(testName)}`).catch(e=>({ok:false,error:e.message}));
    out.search_ms = Date.now()-t1;
    if(sr.ok===false){out.search_error=sr.error;return res.json(out);}
    const sd = await sr.json().catch(e=>({error:e.message}));
    out.search_status = sr.status;
    out.search_result = Array.isArray(sd)?sd.slice(0,2):(sd.players||[sd]).slice(0,2);

    // Step 3: if player found, test gamelog timing
    const player = (Array.isArray(sd)?sd:(sd.players||[]))[0];
    if(player?.id) {
      out.player_id = player.id;
      const t2 = Date.now();
      try {
        const gr = await fetch(`https://${host}/api/dota?action=gamelog&id=${encodeURIComponent(player.id)}&scope=season&teamId=${encodeURIComponent(player.teamId||'')}`,{signal:AbortSignal.timeout(8000)});
        out.gamelog_ms = Date.now()-t2;
        out.gamelog_status = gr.status;
        const gd = await gr.json().catch(()=>({error:'json parse failed'}));
        const games = Array.isArray(gd)?gd:(gd.games||[]);
        out.gamelog_count = games.length;
        out.gamelog_sample = games[0];
      } catch(e) {
        out.gamelog_ms = Date.now()-t2;
        out.gamelog_error = e.message;
      }
    } else {
      out.search_note = 'Player not found in dota search';
    }
  }

  if (sport === 'lol') {
    // Step 1: check what PP LoL players look like
    const pp = await fetch('https://api.prizepicks.com/projections?league_id=121&per_page=20',
      {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
    const ppd = await pp.json();
    const pMap = {};
    for(const i of ppd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name,team:i.attributes?.team};
    const projs = (ppd.data||[]).filter(p=>p.type==='projection');
    const samplePlayer = pMap[projs[0]?.relationships?.new_player?.data?.id];
    out.pp_sample_player = samplePlayer;

    // Step 2: search for the player
    const testName = samplePlayer?.name || 'Faker';
    const sr = await fetch(`https://${host}/api/lol?action=search&name=${encodeURIComponent(testName)}`);
    const sd = await sr.json().catch(()=>({error:'json parse'}));
    const players = Array.isArray(sd)?sd:(sd.players||[]);
    out.lol_search = {status:sr.status, count:players.length, first:players[0]};

    // Step 3: if found, test game log
    const p = players[0];
    if(p) {
      const pn = p.playerName||p.name;
      const url = `https://${host}/api/lol?action=gamelog&teamId=${p.teamId}&teamCode=${p.teamCode||''}&leagueName=${encodeURIComponent(p.leagueName||'')}&playerName=${encodeURIComponent(pn)}&name=${encodeURIComponent(pn)}`;
      out.gamelog_url = url;
      const gr = await fetch(url);
      const gd = await gr.json().catch(()=>({error:'json parse'}));
      const games = Array.isArray(gd)?gd:(gd.games||[]);
      out.gamelog_status = gr.status;
      out.gamelog_count = games.length;
      out.gamelog_sample = games[0];
      out.gamelog_has_maps = !!games[0]?.maps;
      out.gamelog_maps3_count = games.filter(g=>g.maps?.length>=3).length;
      out.gamelog_note = games.length===0 ? 'EMPTY - likely LPL player not in LoL Esports API' : 'HAS DATA';
    }
  }

  return res.json(out);
}
