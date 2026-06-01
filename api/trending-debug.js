export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const H = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;

  // Replicate trending.js flow exactly for NFL, 3 players only
  const pp = await fetch('https://api.prizepicks.com/projections?league_id=9&per_page=250',{headers:H});
  const pd = await pp.json();
  const pMap = {};
  for (const i of pd.included||[]) if(i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name};
  const projs = (pd.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed').map(p=>{
    const pid=p.relationships?.new_player?.data?.id;
    return { name:pMap[pid]?.name, stat:p.attributes?.stat_type, line:parseFloat(p.attributes?.line_score)||0 };
  }).filter(p=>p.name&&p.stat&&p.line>0);

  // Get 3 unique players
  const seen=new Set(), players=[];
  for(const p of projs){ if(!seen.has(p.name)&&players.length<3){seen.add(p.name);players.push(p.name);}}

  const results = {};
  for (const name of players) {
    const n = norm(name);
    // Step 1: findPlayer
    const sr = await fetch(`https://${host}/api/nfl?action=search&q=${encodeURIComponent(name)}`);
    const sd = await sr.json().catch(()=>[]);
    const list = Array.isArray(sd)?sd:[];
    const player = list.find(p=>norm(p.name)===n)||list[0]||null;

    // Step 2: fetchLog with id
    let games = [];
    let logError = null;
    if (player?.id) {
      const t = Date.now();
      try {
        const gr = await fetch(`https://${host}/api/nfl?action=gamelog&id=${encodeURIComponent(player.id)}`);
        const gd = await gr.json();
        games = Array.isArray(gd)?gd:[];
        results[name] = { player_id: player.id, player_name: player.name, ms: Date.now()-t, game_count: games.length, id_used: player.id };
      } catch(e) { logError = e.message; }
    }
    results[name] = { ...(results[name]||{}), player_found: !!player, player_id: player?.id, logError };
  }

  return res.json({ projs_total: projs.length, players_tested: players, results });
}
