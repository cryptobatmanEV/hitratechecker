export const config = { maxDuration: 30 };
const KEY = '16671c2193msh3dc96da6f4fdb02p1b2b4bjsn5ce9c99fdb44';
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const BASE = 'https://' + HOST;
const H = {'x-rapidapi-key':KEY,'x-rapidapi-host':HOST,'Content-Type':'application/json'};
async function get(path) {
  try {
    const r = await fetch(BASE+path,{headers:H,signal:AbortSignal.timeout(8000)});
    const body = await r.json().catch(()=>null);
    return {status:r.status, body};
  } catch(e) { return {status:0, error:e.message}; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: Small page first - see count and structure
  const p1 = await get('/tennis/v2/atp/player?pageSize=10&pageNo=1');
  out.atp_status = p1.status;
  out.atp_is_array = Array.isArray(p1.body);
  out.atp_keys = p1.body?.[0] ? Object.keys(p1.body[0]) : null;
  out.atp_sample = p1.body?.slice(0,3);
  out.atp_error = p1.error;

  // Step 2: Try bigger page if step 1 worked
  if (p1.status === 200 && Array.isArray(p1.body)) {
    const p2 = await get('/tennis/v2/atp/player?pageSize=100&pageNo=1');
    out.atp_100_count = Array.isArray(p2.body) ? p2.body.length : p2.error;
    const djok = p2.body?.find?.(p => p.name?.includes('Djokovic'));
    out.djokovic = djok || 'not in first 100';

    // Step 3: past-matches if we have an ID
    const pid = djok?.id || p2.body?.[0]?.id;
    if (pid) {
      const tour = djok ? 'atp' : 'atp';
      const pm = await get(`/tennis/v2/${tour}/player/past-matches/${pid}`);
      out.pm_status = pm.status;
      const matches = Array.isArray(pm.body) ? pm.body : pm.body?.data;
      out.pm_count = matches?.length;
      out.pm_first = JSON.stringify(matches?.[0]).slice(0,600);
    }
  }

  return res.json(out);
}
