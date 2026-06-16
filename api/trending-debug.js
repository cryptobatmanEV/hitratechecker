export const config = { maxDuration: 20 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PARTNER = 'https://partner-api.prizepicks.com';

async function check(url) {
  try {
    const r = await fetch(url, {headers:{'User-Agent':UA,Accept:'application/json'}, signal:AbortSignal.timeout(8000)});
    const text = await r.text();
    let body; try{body=JSON.parse(text);}catch{body=text.slice(0,200);}
    return {status:r.status, has_datadome: !!r.headers.get('x-datadome'), body};
  } catch(e) { return {error:e.message}; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // MLB should definitely have active props in mid-June
  const mlb = await check(`${PARTNER}/projections?league_id=2&per_page=250`);
  out.mlb_status = mlb.status;
  out.mlb_has_datadome = mlb.has_datadome;
  out.mlb_count = mlb.body?.data?.length;
  out.mlb_sample = mlb.body?.data?.slice(0,2)?.map(p=>({stat:p.attributes?.stat_type, line:p.attributes?.line_score}));

  // WNBA - also in season
  const wnba = await check(`${PARTNER}/projections?league_id=3&per_page=250`);
  out.wnba_count = wnba.body?.data?.length;
  out.wnba_status = wnba.status;

  // Tennis
  const tennis = await check(`${PARTNER}/projections?league_id=5&per_page=250`);
  out.tennis_count = tennis.body?.data?.length;
  out.tennis_status = tennis.status;

  // Stress test: 5 rapid calls to partner-api to see if IT rate limits like the main one did
  const rapid = [];
  for (let i=0;i<5;i++) {
    const r = await check(`${PARTNER}/projections?league_id=2&per_page=10`);
    rapid.push(r.status);
  }
  out.rapid_5_partner = rapid;

  return res.json(out);
}
