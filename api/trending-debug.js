export const config = { maxDuration: 15 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    const r = await fetch('https://api.prizepicks.com/projections?league_id=7&per_page=10', {
      headers: {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'},
      signal: AbortSignal.timeout(7000)
    });
    const headers = {};
    r.headers.forEach((v,k)=>headers[k]=v);
    const text = await r.text();
    return res.json({status:r.status, headers, body_preview:text.slice(0,300)});
  } catch(e) {
    return res.json({error:e.message});
  }
}
