export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';

async function get(url) {
  const r = await fetch(url, {headers:{'User-Agent':UA}});
  return {status:r.status, body: await r.json().catch(()=>null)};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const djId = '296'; // Djokovic ATP
  const out = {};

  // Test every plausible ESPN tennis endpoint
  const tests = {
    // Site API variants
    atp_gamelog: `https://site.api.espn.com/apis/site/v2/sports/tennis/atp/athletes/${djId}/gamelog`,
    atp_stats:   `https://site.api.espn.com/apis/site/v2/sports/tennis/atp/athletes/${djId}/stats`,
    atp_profile: `https://site.api.espn.com/apis/site/v2/sports/tennis/atp/athletes/${djId}`,
    atp_splits:  `https://site.api.espn.com/apis/site/v2/sports/tennis/atp/athletes/${djId}/splits`,
    // Core API
    core_2025:   `https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2025/athletes/${djId}/eventlog?limit=10`,
    core_2024:   `https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2024/athletes/${djId}/eventlog?limit=10`,
    // Common v3 search
    search_wta:  `https://site.api.espn.com/apis/common/v3/search?query=Aryna+Sabalenka&limit=5&type=player&sport=tennis&league=wta`,
    // WTA gamelog for Sabalenka once we get her ID
  };

  for (const [key, url] of Object.entries(tests)) {
    const r = await get(url);
    const body = r.body;
    out[key] = {
      status: r.status,
      keys: body ? Object.keys(body) : null,
      // Show meaningful preview
      preview: key.includes('eventlog') || key.includes('gamelog')
        ? { count: body?.events?.items?.length || body?.count, pageCount: body?.events?.pageCount, sample_item_keys: body?.events?.items?.[0] ? Object.keys(body.events.items[0]) : null }
        : key === 'atp_profile'
        ? { name: body?.athlete?.displayName, leagues: body?.athlete?.leagues?.map(l=>l.name) }
        : key === 'atp_stats'
        ? { categories: body?.categories?.map(c=>({name:c.name,labels:c.labels?.slice(0,5)})) }
        : key === 'search_wta'
        ? { found: body?.items?.[0]?.displayName, id: body?.items?.[0]?.id }
        : JSON.stringify(body).slice(0,200),
    };
  }

  return res.json(out);
}
