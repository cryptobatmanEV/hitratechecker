export const config = { maxDuration: 30 };

async function get(url, headers={}) {
  const r = await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',...headers}});
  return {status:r.status, body:await r.json().catch(()=>null), text: r.status!==200 ? await r.text().catch(()=>'') : null};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Test 1: Sofascore with full browser headers
  const s1 = await get('https://api.sofascore.com/api/v1/search/all?q=Djokovic',{
    'Accept':'application/json','Accept-Language':'en-US,en;q=0.9',
    'Origin':'https://www.sofascore.com','Referer':'https://www.sofascore.com/tennis',
    'Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors','Sec-Fetch-Site':'same-site'
  });
  out.sofascore_full_headers = {status:s1.status, has_results:!!s1.body?.results};

  // Test 2: ATP Tour player match history (internal JSON API)
  const s2 = await get('https://www.atptour.com/en/players/novak-djokovic/d643/ajax/match-history-results?year=2025');
  out.atp_match_history = {status:s2.status, keys:s2.body?Object.keys(s2.body):null, preview:s2.text?.slice(0,200)};

  // Test 3: ATP stats API
  const s3 = await get('https://www.atptour.com/en/stats/player-activity-summary/d643/2025/hard/all/all/0');
  out.atp_stats = {status:s3.status, keys:s3.body?Object.keys(s3.body):null};

  // Test 4: AllSportsAPI (has free tier, tennis stats)
  const s4 = await get('https://apiv2.allsportsapi.com/tennis/?met=Fixtures&APIkey=test&from=2025-01-01&to=2025-01-07');
  out.allsports = {status:s4.status, sample:JSON.stringify(s4.body).slice(0,200)};

  // Test 5: TheSportsDB (free, no key needed for basic data)
  const s5 = await get('https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=Djokovic');
  out.sportsdb_search = {status:s5.status, player:s5.body?.player?.[0]?.strPlayer, id:s5.body?.player?.[0]?.idPlayer};

  // If TheSportsDB has player, try event results
  const sdbId = s5.body?.player?.[0]?.idPlayer;
  if (sdbId) {
    const s6 = await get(`https://www.thesportsdb.com/api/v2/json/50130162/eventsplayer.php?id=${sdbId}&s=2024-2025`);
    out.sportsdb_events = {status:s6.status, count:s6.body?.event?.length, sample:s6.body?.event?.[0]};
  }

  return res.json(out);
}
