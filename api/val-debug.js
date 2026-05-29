export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const get = async (url) => {
  const r = await fetch(url.replace('http://','https://'), { headers:{'User-Agent':UA} });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Isaiah Hartenstein - search to get his ESPN ID
  const search = await get('https://site.api.espn.com/apis/common/v3/search?query=Hartenstein&limit=5&type=player&sport=basketball&league=nba');
  const player = search.items?.find(p => p.displayName?.includes('Hartenstein'));
  if (!player) return res.json({ error: 'Player not found', items: search.items?.map(p=>p.displayName) });

  const id = player.id;
  const out = { player: player.displayName, id };

  // Get current season eventlog (small limit to be fast)
  const el = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/athletes/${id}/eventlog?limit=10`);
  const items = (el.events?.items || []).filter(i => i.played);
  out.total_played_items = items.length;

  // Fetch the competition for first 3 games and show ALL top-level fields
  const samples = [];
  for (const item of items.slice(0, 3)) {
    try {
      const comp = await get(item.competition.$ref);
      samples.push({
        comp_top_keys: Object.keys(comp),
        comp_season:   comp.season,         // does season exist? what's in it?
        comp_type:     comp.type,           // is there a top-level type?
        comp_date:     comp.date?.slice(0,10),
        comp_status_type: comp.status?.$ref ? 'ref' : comp.status?.type,
      });
    } catch(e) { samples.push({ error: e.message }); }
  }
  out.competition_samples = samples;

  return res.json(out);
}
