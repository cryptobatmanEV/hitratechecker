export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
async function safeGet(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    const r = await fetch(url.replace('http://','https://'),{headers:{'User-Agent':UA}});
    return r.json().catch(()=>null);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: get eventlog item
  const log = await safeGet('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2025/athletes/296/eventlog?limit=2');
  const item = log?.events?.items?.[0];
  out.item_keys = item ? Object.keys(item) : null;
  out.item_competitor_ref = item?.competitor?.$ref?.slice(-60);

  // Step 2: fetch competition
  const comp = await safeGet(item?.competition?.$ref);
  out.comp_statsSource = typeof comp?.statsSource === 'string' ? comp.statsSource.slice(-80) : comp?.statsSource;
  out.comp_competitors = comp?.competitors?.slice(0,2).map(c=>({
    id: c.id,
    winner: c.winner,
    has_stats_ref: !!c.statistics?.$ref,
    stats_ref_tail: c.statistics?.$ref?.slice(-60),
    score: c.score,
  }));

  // Step 3: fetch item.competitor ref
  const competitor = await safeGet(item?.competitor?.$ref);
  out.competitor_preview = competitor ? JSON.stringify(competitor).slice(0,500) : null;

  // Step 4: fetch the competitor stats from competition object
  const myCompStats = comp?.competitors?.find(c=>c.id==='296')?.statistics?.$ref;
  const stats = await safeGet(myCompStats);
  out.stats_preview = stats ? JSON.stringify(stats).slice(0,500) : null;
  out.stats_keys = stats ? Object.keys(stats) : null;

  return res.json(out);
}
