export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const H = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  // Hit PP's leagues endpoint to get all league IDs
  const r = await fetch('https://api.prizepicks.com/leagues', {headers:H});
  const d = await r.json();

  const leagues = (d.data||[]).map(l=>({
    id: l.id,
    name: l.attributes?.name||l.attributes?.sport||'',
    sport: l.attributes?.sport,
    active: l.attributes?.active,
  })).filter(l=>l.name||l.sport);

  return res.json({ total: leagues.length, leagues });
}
