export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function tryFetch(headers) {
  try {
    const r = await fetch('https://api.prizepicks.com/projections?league_id=7&per_page=10', {headers, signal:AbortSignal.timeout(7000)});
    return r.status;
  } catch(e) { return `ERR:${e.message}`; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Test 1: 5 rapid calls with current headers (Accept + UA + Referer)
  const basicHeaders = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};
  const rapid = [];
  for (let i=0;i<5;i++) rapid.push(await tryFetch(basicHeaders));
  out.rapid_5_calls = rapid;

  // Test 2: fuller browser-like headers (mimics what worked for other sites when blocked)
  const fullHeaders = {
    Accept:'application/json, text/plain, */*',
    'Accept-Language':'en-US,en;q=0.9',
    'User-Agent':UA,
    Referer:'https://app.prizepicks.com/',
    Origin:'https://app.prizepicks.com',
    'Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors','Sec-Fetch-Site':'same-site',
  };
  out.full_headers_status = await tryFetch(fullHeaders);

  // Test 3: a few different league_ids to see if it's global or league-specific
  out.nfl_status = await tryFetch(basicHeaders); // will reuse since same params, just checking consistency
  try {
    const r2 = await fetch('https://api.prizepicks.com/projections?league_id=9&per_page=10',{headers:basicHeaders,signal:AbortSignal.timeout(7000)});
    out.nfl_league_status = r2.status;
  } catch(e){ out.nfl_league_status = `ERR:${e.message}`; }

  return res.json(out);
}
