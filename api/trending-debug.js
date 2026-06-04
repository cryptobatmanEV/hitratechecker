export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
async function get(url) {
  const r = await fetch(url.replace('http://','https://'),{headers:{'User-Agent':UA}});
  return r.json().catch(()=>null);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  const log = await get('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2025/athletes/296/eventlog?limit=3');
  const item = log?.events?.items?.[0];
  out.item = item;

  // Fetch competitor ref (unique to tennis vs NFL)
  if (item?.competitor?.$ref) {
    const comp = await get(item.competitor.$ref);
    out.competitor_keys = comp ? Object.keys(comp) : null;
    out.competitor_sample = JSON.stringify(comp).slice(0,800);
  }

  // Fetch competition and then statsSource/linescoreSource
  if (item?.competition?.$ref) {
    const competition = await get(item.competition.$ref);
    out.statsSource = competition?.statsSource;
    out.linescoreSource = competition?.linescoreSource;
    out.competitors_full = competition?.competitors?.slice(0,2).map(c=>({
      id:c.id, winner:c.winner,
      athlete_ref: c.athlete?.$ref?.slice(-40),
      statistics_ref: c.statistics?.$ref?.slice(-60),
      score: c.score,
    }));

    // Try to fetch statsSource
    if (competition?.statsSource) {
      const stats = await get(competition.statsSource);
      out.statsSource_keys = stats ? Object.keys(stats) : null;
      out.statsSource_sample = JSON.stringify(stats).slice(0,600);
    }

    // Try to fetch first competitor's statistics
    const myComp = competition?.competitors?.find(c=>c.id==='296');
    if (myComp?.statistics?.$ref) {
      const stats = await get(myComp.statistics.$ref);
      out.competitor_stats_keys = stats ? Object.keys(stats) : null;
      out.competitor_stats_splits = stats?.splits?.categories?.map(c=>({
        name: c.name||c.type,
        stats: c.stats?.map(s=>({name:s.name,value:s.value}))
      }));
    }
  }

  return res.json(out);
}
