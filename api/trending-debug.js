export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
async function get(url) {
  const r = await fetch(url.replace('http://','https://'),{headers:{'User-Agent':UA},signal:AbortSignal.timeout(8000)});
  return r.json().catch(()=>null);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Get 2024 eventlog - more likely to have complete data
  const log = await get('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2024/athletes/296/eventlog?limit=10');
  out.events_count = log?.events?.count;

  // Find first match where opponent is NOT id=0
  const items = log?.events?.items || [];
  let targetItem = null;
  for (const item of items) {
    const comp = await get(item?.competition?.$ref);
    const hasRealOpponent = comp?.competitors?.some(c => c.id !== '296' && c.id !== '0');
    if (hasRealOpponent) {
      targetItem = { item, comp };
      break;
    }
  }

  if (targetItem) {
    const { comp } = targetItem;
    out.comp_date = comp.date;
    out.comp_id = comp.id;
    out.comp_competitors = comp.competitors?.map(c=>({
      id:c.id, winner:c.winner, score:c.score,
      linescores: c.linescores?.map(l=>({value:l.value})),
      has_stats: !!c.statistics?.$ref,
    }));
    out.comp_format = comp.format;
    out.comp_status = comp.status;

    // Try ESPN summary endpoint for the match score
    const summary = await get(`https://site.api.espn.com/apis/site/v2/sports/tennis/atp/summary?event=${comp.id}`);
    out.summary_keys = summary ? Object.keys(summary) : null;
    out.summary_boxscore = summary?.boxScore ? JSON.stringify(summary.boxScore).slice(0,600) : null;
    out.summary_linescore = summary?.header?.competitions?.[0]?.competitors?.map(c=>({
      id:c.id, winner:c.winner, score:c.score,
      linescores: c.linescores?.map(l=>({value:l.value})),
    }));
  } else {
    out.no_real_opponent = true;
  }

  return res.json(out);
}
