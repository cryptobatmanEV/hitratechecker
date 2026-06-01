export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const H = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;
  const out = {};

  // 1. Get a real PP NFL prop
  const pp = await fetch('https://api.prizepicks.com/projections?league_id=9&per_page=10', {headers:H});
  const pd = await pp.json();
  const pMap = {};
  for (const i of pd.included||[]) if(i.type==='new_player') pMap[i.id]=i.attributes?.display_name||i.attributes?.name;
  const proj = (pd.data||[]).find(p=>p.type==='projection');
  const playerName = pMap[proj?.relationships?.new_player?.data?.id];
  const stat = proj?.attributes?.stat_type;
  const line = proj?.attributes?.line_score;
  out.pp_prop = { player: playerName, stat, line };

  // 2. Find player via NFL search
  const sr = await fetch(`https://${host}/api/nfl?action=search&q=${encodeURIComponent(playerName)}`);
  const sd = await sr.json().catch(()=>[]);
  const player = (Array.isArray(sd)?sd:[])[0];
  out.search = { found: !!player, id: player?.id, name: player?.name };

  // 3. Get gamelog
  if (player?.id) {
    const gr = await fetch(`https://${host}/api/nfl?action=gamelog&id=${player.id}`);
    const gd = await gr.json().catch(()=>[]);
    const games = Array.isArray(gd)?gd:[];
    out.gamelog = { count: games.length, sample_stat: games[0]?.[stat.toLowerCase().replace(' ','Yds').replace(' ','')], sample_game: games[0] };

    // 4. Check if stat calc works
    const CALCS = { 'Pass Yards': g=>g.passYds||0, 'Receiving Yards': g=>g.recYds||0, 'Rush Yards': g=>g.rushYds||0, 'Rush+Rec TDs': g=>(g.rushTDs||0)+(g.recTDs||0) };
    const fn = CALCS[stat];
    if (fn && games.length) {
      const vals = games.map(fn);
      out.calc = { stat_fn_exists: !!fn, sample_vals: vals.slice(0,5), line, over_count: vals.filter(v=>v>line).length, total: vals.length };
    } else {
      out.calc = { stat_fn_exists: !!fn, error: !fn ? `No calc for "${stat}"` : 'no games' };
    }
  }

  // 5. Check PP prop status field
  out.prop_status = proj?.attributes?.status;
  out.prop_start_time = proj?.attributes?.start_time;

  return res.json(out);
}
