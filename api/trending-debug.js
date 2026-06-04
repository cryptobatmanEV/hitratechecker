export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
async function get(url) {
  try {
    const r = await fetch(url.replace('http://','https://'),{headers:{'User-Agent':UA},signal:AbortSignal.timeout(7000)});
    return r.json().catch(()=>null);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  // Get 2024 Djokovic eventlog
  const log = await get('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2024/athletes/296/eventlog?limit=5');
  const items = log?.events?.items || [];

  // Just grab the 3rd competition ref and inspect it fully
  const compRef = items[2]?.competition?.$ref;
  if (!compRef) return res.json({error:'no comp ref', items_count: items.length});

  const comp = await get(compRef);
  if (!comp) return res.json({error:'comp fetch failed'});

  // Competitor details
  const competitors = comp.competitors?.map(c=>({
    id: c.id,
    winner: c.winner,
    score: c.score,
    linescores: c.linescores,
    stats_ref: c.statistics?.$ref?.slice(-50),
  }));

  // Try summary endpoint
  const summary = await get(`https://site.api.espn.com/apis/site/v2/sports/tennis/atp/summary?event=${comp.id}`);

  return res.json({
    comp_id: comp.id,
    comp_date: comp.date,
    comp_status_type: comp.status?.type?.name,
    competitors,
    summary_keys: summary ? Object.keys(summary) : null,
    summary_comps: summary?.header?.competitions?.[0]?.competitors?.map(c=>({
      id: c.id, winner: c.winner, score: c.score,
      linescores: c.linescores?.slice(0,4),
    })),
  });
}
