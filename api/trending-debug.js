export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='dota' } = req.query;
  const host = req.headers.host;
  const lid = { dota:'174', lol:'121' }[sport];
  if (!lid) return res.json({error:'use ?sport=dota or lol'});

  const r = await fetch(`https://api.prizepicks.com/projections?league_id=${lid}&per_page=100`,
    {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
  const d = await r.json();

  const pMap = {};
  for (const i of d.included||[]) {
    if (i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name,team:i.attributes?.team};
  }

  const projs = (d.data||[]).filter(p=>p.type==='projection'&&p.attributes?.status!=='closed');
  const sample5 = projs.slice(0,5).map(p=>({
    stat: p.attributes?.stat_type,
    line: p.attributes?.line_score,
    odds_type: p.attributes?.odds_type,
    event_type: p.attributes?.event_type,
    player: pMap[p.relationships?.new_player?.data?.id]?.name,
  }));

  const statTypes = [...new Set(projs.map(p=>p.attributes?.stat_type))];
  const oddsTypes = [...new Set(projs.map(p=>p.attributes?.odds_type))];
  const eventTypes = [...new Set(projs.map(p=>p.attributes?.event_type))];

  // Test player search for first player
  const firstName = sample5[0]?.player;
  let searchResult = null;
  if (firstName && sport==='dota') {
    const sr = await fetch(`https://${host}/api/dota?action=search&q=${encodeURIComponent(firstName)}`);
    const sd = await sr.json(); 
    const players = Array.isArray(sd)?sd:(sd.players||[]);
    searchResult = { searched:firstName, status:sr.status, count:players.length, first:players[0] };
  }
  if (firstName && sport==='lol') {
    const sr = await fetch(`https://${host}/api/lol?action=search&name=${encodeURIComponent(firstName)}`);
    const sd = await sr.json();
    const players = Array.isArray(sd)?sd:(sd.players||[]);
    searchResult = { searched:firstName, status:sr.status, count:players.length, first:players[0] };
  }

  return res.json({ sport, total_projs:projs.length, stat_types:statTypes, odds_types:oddsTypes, event_types:eventTypes, sample5, player_search:searchResult });
}
