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

  // 1. Search for both ATP and WTA players
  const search = await get('/tennis/v2/search?search=Djokovic');
  const buckets = search.body?.data || [];
  const atpBucket = buckets.find(b=>b.category==='player_atp');
  const wtaBucket = buckets.find(b=>b.category==='player_wta');
  const atpPlayer = atpBucket?.result?.[0];
  out.search_atp = {id:atpPlayer?.id, name:atpPlayer?.name};

  // Also find a WTA player
  const sabaSearch = await get('/tennis/v2/search?search=Sabalenka');
  const sabaBuckets = sabaSearch.body?.data || [];
  const wtaPlayer = sabaBuckets.find(b=>b.category==='player_wta')?.result?.[0];
  out.search_wta = {id:wtaPlayer?.id, name:wtaPlayer?.name};

  // 2. CRITICAL: past-matches - does it have per-match aces/DFs?
  if (atpPlayer?.id) {
    const pm = await get(`/tennis/v2/atp/player/past-matches/${atpPlayer.id}`);
    out.past_matches_status = pm.status;
    out.past_matches_keys = pm.body ? Object.keys(pm.body) : null;
    const matches = pm.body?.data || pm.body?.matches || pm.body;
    const firstMatch = Array.isArray(matches) ? matches[0] : null;
    out.first_match_keys = firstMatch ? Object.keys(firstMatch) : null;
    out.first_match_sample = firstMatch ? JSON.stringify(firstMatch).slice(0,600) : null;
    out.total_matches = Array.isArray(matches) ? matches.length : null;
  }

  // 3. Also check if there's a filter option for past-matches (year, pageSize)
  if (atpPlayer?.id) {
    const pm2 = await get(`/tennis/v2/atp/player/past-matches/${atpPlayer.id}?pageSize=3`);
    out.past_matches_paginated_count = pm2.body?.data?.length || pm2.body?.length;
    out.past_matches_second_match = JSON.stringify((pm2.body?.data||pm2.body)?.[1]).slice(0,400);
  }

  return res.json(out);
}
