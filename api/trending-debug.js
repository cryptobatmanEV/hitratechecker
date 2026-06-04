export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';

async function get(url) {
  const r = await fetch(url.replace('http://','https://'), {headers:{'User-Agent':UA}});
  return r.json().catch(()=>null);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Get first eventlog item for Djokovic (ATP) and Sabalenka (WTA)
  for (const [name, league, id] of [['djokovic','atp','296'],['sabalenka','wta','3038']]) {
    const log = await get(`https://sports.core.api.espn.com/v2/sports/tennis/leagues/${league}/seasons/2025/athletes/${id}/eventlog?limit=3`);
    const item = log?.events?.items?.[0];
    out[`${name}_item_keys`] = item ? Object.keys(item) : null;
    out[`${name}_played`] = item?.played;
    out[`${name}_teamId`] = item?.teamId;

    // Fetch the statistics ref
    if (item?.statistics?.$ref) {
      const stats = await get(item.statistics.$ref);
      out[`${name}_stats_keys`] = stats ? Object.keys(stats) : null;
      out[`${name}_splits_categories`] = stats?.splits?.categories?.map(c=>({
        name: c.name||c.type,
        labels: c.labels||c.names,
        stats: c.stats?.slice(0,8).map(s=>({name:s.name,value:s.value})),
      }));
    }

    // Fetch competition ref for match metadata
    if (item?.competition?.$ref) {
      const comp = await get(item.competition.$ref);
      out[`${name}_comp_keys`] = comp ? Object.keys(comp) : null;
      out[`${name}_comp_date`] = comp?.date;
      out[`${name}_comp_name`] = comp?.name;
      out[`${name}_comp_competitors`] = comp?.competitors?.map(c=>({id:c.id,homeAway:c.homeAway,winner:c.winner}));
    }
  }

  return res.json(out);
}
