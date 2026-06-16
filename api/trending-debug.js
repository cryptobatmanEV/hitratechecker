export const config = { maxDuration: 15 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    // Get a real player ID from an MLB projection first
    const proj = await fetch('https://partner-api.prizepicks.com/projections?league_id=2&per_page=5',
      {headers:{Accept:'application/json','User-Agent':UA}});
    const pd = await proj.json();
    const playerId = pd.data?.[0]?.relationships?.new_player?.data?.id;

    // Now test new_players on partner-api
    const r = await fetch(`https://partner-api.prizepicks.com/new_players/${playerId}`,
      {headers:{Accept:'application/json','User-Agent':UA}});
    const text = await r.text();
    let body; try{body=JSON.parse(text);}catch{body=text.slice(0,200);}

    return res.json({
      player_id_used: playerId,
      status: r.status,
      has_datadome: !!r.headers.get('x-datadome'),
      body
    });
  } catch(e) { return res.json({error:e.message}); }
}
