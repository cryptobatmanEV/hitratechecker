export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
async function get(url, opts={}) {
  try {
    const r = await fetch(url, {headers:{'User-Agent':UA,...opts.headers}, signal:AbortSignal.timeout(8000)});
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0,300); }
    return {status:r.status, body};
  } catch(e) { return {status:0, error:e.message}; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Is the trending endpoint itself reachable?
  const host = req.headers.host;
  const t = await get(`https://${host}/api/trending?sport=nba&statType=Points&scope=total`);
  out.trending_self = {status:t.status, preview: typeof t.body==='string'?t.body.slice(0,300):JSON.stringify(t.body).slice(0,300)};

  // 2. Is PrizePicks reachable at all right now?
  const pp = await get('https://api.prizepicks.com/projections?league_id=7&per_page=10', {headers:{'Referer':'https://app.prizepicks.com/'}});
  out.pp_direct = {status:pp.status, preview: typeof pp.body==='string'?pp.body.slice(0,300):JSON.stringify(pp.body).slice(0,300)};

  return res.json(out);
}
