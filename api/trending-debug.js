export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const H = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. PP tennis props — what stat types exist?
  const pp = await fetch('https://api.prizepicks.com/projections?league_id=5&per_page=50', {headers:H});
  const pd = await pp.json();
  const pMap = {};
  for (const i of pd.included||[]) if(i.type==='new_player') pMap[i.id]=i.attributes?.display_name||i.attributes?.name;
  const projs = (pd.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed');
  out.pp_total = projs.length;
  out.pp_stat_types = [...new Set(projs.map(p=>p.attributes?.stat_type))];
  out.pp_sample = projs.slice(0,4).map(p=>({
    stat: p.attributes?.stat_type,
    line: p.attributes?.line_score,
    player: pMap[p.relationships?.new_player?.data?.id],
    odds_type: p.attributes?.odds_type,
  }));

  // 2. ESPN search for a known tennis player
  const sr = await fetch('https://site.api.espn.com/apis/common/v3/search?query=Novak+Djokovic&limit=5&type=player&sport=tennis&league=atp',{headers:{UA}});
  const sd = await sr.json();
  const player = (sd.items||[])[0];
  out.espn_search = { found: !!player, id: player?.id, name: player?.displayName, league: player?.league };

  // 3. ESPN tennis gamelog for that player
  if (player?.id) {
    const gr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/tennis/atp/athletes/${player.id}/gamelog`);
    const gd = await gr.json();
    out.espn_gamelog_keys = Object.keys(gd);
    out.espn_gamelog_categories = gd.categories?.map(c=>c.name||c.type);
    out.espn_gamelog_labels = gd.categories?.[0]?.labels || gd.categories?.[0]?.names;
    out.espn_events_count = gd.events?.length;
    // Show first event's stats
    const firstEvent = gd.events?.[0];
    out.espn_first_event = firstEvent ? { keys: Object.keys(firstEvent), stats: firstEvent.stats?.slice(0,10), labels_with_vals: gd.categories?.[0]?.labels?.map((l,i)=>({[l]:firstEvent.stats?.[i]})) } : null;
  }

  // 4. Also check if PP tennis uses ATP or WTA or both
  out.pp_player_sample = Object.values(pMap).slice(0,5);

  return res.json(out);
}
