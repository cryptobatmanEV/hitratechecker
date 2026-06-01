export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='lol' } = req.query;
  const host = req.headers.host;

  if (sport === 'lol') {
    const r = await fetch('https://api.prizepicks.com/projections?league_id=121&per_page=250',
      {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
    const d = await r.json();
    const pMap = {};
    for (const i of d.included||[]) {
      if (i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name, combo:i.attributes?.combo===true};
    }
    const projs = (d.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed');
    // Break down by event_type
    const byEventType = {};
    const byPlayerType = {combo_player:0, individual_player:0, unknown:0};
    for (const p of projs) {
      const et = p.attributes?.event_type||'unknown';
      byEventType[et] = (byEventType[et]||0)+1;
      const pid = p.relationships?.new_player?.data?.id;
      const pl = pMap[pid];
      if (!pl) byPlayerType.unknown++;
      else if (pl.combo) byPlayerType.combo_player++;
      else byPlayerType.individual_player++;
    }
    // Sample non-combo projections
    const nonCombo = projs.filter(p=>p.attributes?.event_type!=='combo').slice(0,3).map(p=>{
      const pid = p.relationships?.new_player?.data?.id;
      return { pid, player:pMap[pid], stat:p.attributes?.stat_type, line:p.attributes?.line_score, event_type:p.attributes?.event_type };
    });
    return res.json({ sport:'lol', total_projs:projs.length, by_event_type:byEventType, by_player_type:byPlayerType, non_combo_sample:nonCombo });
  }

  if (sport === 'dota') {
    // Full Dota trending test
    const r = await fetch(`https://${host}/api/trending?sport=dota`);
    const d = await r.json();
    return res.json({ sport:'dota', trending_debug:d.debug, result_count:(d.results||[]).length, first_result:d.results?.[0] });
  }
}
