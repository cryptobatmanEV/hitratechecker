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

  // 1. How many ATP players total? Try large pageSize
  const p1 = await get('/tennis/v2/atp/player?pageSize=500&pageNo=1');
  const atpPlayers = p1.body;
  out.atp_count = Array.isArray(atpPlayers) ? atpPlayers.length : null;
  out.atp_keys = atpPlayers?.[0] ? Object.keys(atpPlayers[0]) : null;
  out.atp_sample = atpPlayers?.slice(0,2);

  // Find Djokovic in the list
  const djok = Array.isArray(atpPlayers) ? atpPlayers.find(p=>p.name?.includes('Djokovic')) : null;
  out.djokovic_found = djok;

  // 2. WTA player count
  const p2 = await get('/tennis/v2/wta/player?pageSize=500&pageNo=1');
  const wtaPlayers = p2.body;
  out.wta_count = Array.isArray(wtaPlayers) ? wtaPlayers.length : null;

  // 3. Test past-matches with Djokovic's ID
  if (djok?.id) {
    const pm = await get(`/tennis/v2/atp/player/past-matches/${djok.id}`);
    out.past_matches_status = pm.status;
    const matches = Array.isArray(pm.body) ? pm.body : pm.body?.data;
    out.total_matches = matches?.length;
    out.first_match = JSON.stringify(matches?.[0]).slice(0,600);
    out.second_match = JSON.stringify(matches?.[1]).slice(0,400);
  }

  return res.json(out);
}
