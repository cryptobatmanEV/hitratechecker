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

  // Fetch linescores for Djokovic (id 296) in comp 150053 (2024-10-08)
  const ls296 = await get('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/events/315-2024/competitions/150053/competitors/296/linescores');
  // Fetch opponent linescores too (id 7602)
  const ls7602 = await get('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/events/315-2024/competitions/150053/competitors/7602/linescores');

  // Also fetch 3 more competitions to see if linescores are consistent
  const log = await get('https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/2024/athletes/296/eventlog?limit=8');
  const items = log?.events?.items || [];
  // Check which items have linescore refs
  const linescore_check = items.slice(0,5).map(item=>({
    has_competition: !!item?.competition?.$ref,
    played: item?.played,
  }));

  return res.json({
    djokovic_linescores: ls296,
    opponent_linescores: ls7602,
    linescore_check,
  });
}
