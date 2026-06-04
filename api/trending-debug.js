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

  // Full raw search result to see exact field names
  const s = await get('/tennis/v2/search?search=Djokovic');
  out.raw_search = JSON.stringify(s.body).slice(0,1000);

  // Extract player ID whatever field it's in
  const buckets = s.body?.data || [];
  const atpResult = buckets.find(b=>b.category==='player_atp')?.result?.[0];
  out.atp_result_keys = atpResult ? Object.keys(atpResult) : null;
  out.atp_result_full = atpResult;

  // Use whichever ID field exists
  const pid = atpResult?.id || atpResult?.playerId || atpResult?.player_id;
  out.resolved_pid = pid;

  if (pid) {
    const pm = await get(`/tennis/v2/atp/player/past-matches/${pid}`);
    out.past_matches_status = pm.status;
    const matches = pm.body?.data || pm.body;
    const first = Array.isArray(matches) ? matches[0] : (matches?.data?.[0]);
    out.first_match_keys = first ? Object.keys(first) : null;
    out.first_match_full = first ? JSON.stringify(first).slice(0,800) : null;
    out.total_count = Array.isArray(matches) ? matches.length : null;
  }

  return res.json(out);
}
