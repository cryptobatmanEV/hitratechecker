export const config = { maxDuration: 30 };
const KEY = '16671c2193msh3dc96da6f4fdb02p1b2b4bjsn5ce9c99fdb44';
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const BASE = 'https://' + HOST;
const H = {'x-rapidapi-key':KEY,'x-rapidapi-host':HOST,'Content-Type':'application/json'};

async function get(path) {
  const r = await fetch(BASE+path,{headers:H});
  return {status:r.status, body:await r.json().catch(()=>null)};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Test the provided endpoint
  const t1 = await get('/tennis/v2/atp/player/tournament-record/68074/21305');
  out.tournament_record = {status:t1.status, keys:t1.body?Object.keys(t1.body):null, preview:JSON.stringify(t1.body).slice(0,400)};

  // 2. Try player search
  const t2 = await get('/tennis/v2/atp/player/search/Djokovic');
  out.search_atp = {status:t2.status, preview:JSON.stringify(t2.body).slice(0,400)};

  // 3. Try player recent matches / activity
  const t3 = await get('/tennis/v2/atp/player/activity/68074');
  out.player_activity = {status:t3.status, preview:JSON.stringify(t3.body).slice(0,400)};

  // 4. Try player profile
  const t4 = await get('/tennis/v2/atp/player/68074');
  out.player_profile = {status:t4.status, preview:JSON.stringify(t4.body).slice(0,300)};

  // 5. Try player stats
  const t5 = await get('/tennis/v2/atp/player/stats/68074');
  out.player_stats = {status:t5.status, preview:JSON.stringify(t5.body).slice(0,400)};

  // 6. Try WTA search too (PP has both ATP and WTA players)
  const t6 = await get('/tennis/v2/wta/player/search/Sabalenka');
  out.search_wta = {status:t6.status, preview:JSON.stringify(t6.body).slice(0,300)};

  return res.json(out);
}
