export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const H = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  const r = await fetch('https://api.prizepicks.com/projections?league_id=9&per_page=50', {headers:H});
  const d = await r.json();

  const pMap = {};
  for (const i of d.included||[]) {
    if (i.type==='new_player') pMap[i.id] = i.attributes?.display_name||i.attributes?.name;
  }

  const projs = (d.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed');
  const statTypes = [...new Set(projs.map(p=>p.attributes?.stat_type))];
  const sample = projs.slice(0,5).map(p=>({
    stat: p.attributes?.stat_type,
    line: p.attributes?.line_score,
    player: pMap[p.relationships?.new_player?.data?.id],
    event_type: p.attributes?.event_type,
    odds_type: p.attributes?.odds_type,
  }));

  return res.json({ total: projs.length, stat_types: statTypes, sample });
}
