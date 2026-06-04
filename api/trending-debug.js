export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const H = {'User-Agent':UA,'Referer':'https://www.sofascore.com/'};

async function get(url) {
  const r = await fetch(url,{headers:H});
  return {status:r.status, body:await r.json().catch(()=>null)};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Search Sofascore for Djokovic
  const s = await get('https://api.sofascore.com/api/v1/search/all?q=Djokovic');
  const players = (s.body?.results||[]).filter(r=>r.type==='player'&&r.entity?.sport?.slug==='tennis');
  out.search_status = s.status;
  out.player_found = players[0]?.entity ? {id:players[0].entity.id, name:players[0].entity.name} : null;

  const pid = players[0]?.entity?.id;
  if (pid) {
    // 2. Get recent events (matches)
    const events = await get(`https://api.sofascore.com/api/v1/player/${pid}/events/last/0`);
    out.events_status = events.status;
    out.events_count = events.body?.events?.length;
    const firstEvent = events.body?.events?.[0];
    out.first_event = firstEvent ? {id:firstEvent.id, name:firstEvent.homeTeam?.name+' vs '+firstEvent.awayTeam?.name, date:firstEvent.startTimestamp} : null;

    // 3. Get statistics for that match
    if (firstEvent?.id) {
      const stats = await get(`https://api.sofascore.com/api/v1/event/${firstEvent.id}/statistics`);
      out.stats_status = stats.status;
      const allGroups = stats.body?.statistics?.[0]?.groups;
      out.stat_groups = allGroups?.map(g=>g.groupName);
      // Find serve stats group
      const serveGroup = allGroups?.find(g=>g.groupName?.toLowerCase().includes('serv'));
      out.serve_stats = serveGroup?.statisticsItems?.map(i=>({name:i.name,home:i.home,away:i.away}));
      // Show all items from first 2 groups
      out.first_two_groups = allGroups?.slice(0,2).map(g=>({
        name:g.groupName,
        items:g.statisticsItems?.map(i=>({name:i.name,home:i.home,away:i.away}))
      }));
    }
  }

  return res.json(out);
}
