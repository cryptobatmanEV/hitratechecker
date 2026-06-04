export const config = { maxDuration: 30 };
const KEY  = process.env.RAPIDAPI_TENNIS_KEY;
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const BASE = `https://${HOST}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Confirm key is present
  out.key_present = !!KEY;
  out.key_prefix  = KEY ? KEY.slice(0,8)+'...' : null;

  // 2. Fetch page 1 of ATP - what is the actual response structure?
  try {
    const r = await fetch(`${BASE}/tennis/v2/atp/player?pageSize=10&pageNo=1&filter=PlayerGroup:singles`,
      {headers:{'x-rapidapi-key':KEY,'x-rapidapi-host':HOST},signal:AbortSignal.timeout(8000)});
    const body = await r.json();
    out.page1_status  = r.status;
    out.page1_is_array = Array.isArray(body);
    out.page1_has_data = !!body?.data;
    out.page1_data_is_array = Array.isArray(body?.data);
    const list = Array.isArray(body) ? body : (body?.data || []);
    out.page1_list_len = list.length;
    out.page1_first = list[0];
  } catch(e) { out.page1_err = e.message; }

  // 3. Try page 3 (likely has "C" names for Carlos Alcaraz)
  try {
    const r = await fetch(`${BASE}/tennis/v2/atp/player?pageSize=200&pageNo=3&filter=PlayerGroup:singles`,
      {headers:{'x-rapidapi-key':KEY,'x-rapidapi-host':HOST},signal:AbortSignal.timeout(8000)});
    const body = await r.json();
    const list = Array.isArray(body) ? body : (body?.data || []);
    const alcaraz = list.find(p => (p.name||'').toLowerCase().includes('alcaraz'));
    out.page3_len = list.length;
    out.page3_has_alcaraz = !!alcaraz;
    out.page3_alcaraz = alcaraz || null;
    out.page3_first3 = list.slice(0,3).map(p=>p.name);
    out.page3_last3  = list.slice(-3).map(p=>p.name);
  } catch(e) { out.page3_err = e.message; }

  // 4. Check current PP tennis projections (do any match our supported stats?)
  try {
    const r = await fetch('https://api.prizepicks.com/projections?league_id=5&per_page=50',
      {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://app.prizepicks.com/'}});
    const d = await r.json();
    const projs = (d.data||[]).filter(p=>p.type==='projection');
    out.pp_total = projs.length;
    out.pp_stat_types = [...new Set(projs.map(p=>p.attributes?.stat_type))];
    out.pp_supported = projs.filter(p=>['Total Sets','Total Games','Total Games Won','Total Tie Breaks'].includes(p.attributes?.stat_type)).length;
  } catch(e) { out.pp_err = e.message; }

  return res.json(out);
}
