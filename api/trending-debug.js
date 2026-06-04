export const config = { maxDuration: 15 };
const KEY = '16671c2193msh3dc96da6f4fdb02p1b2b4bjsn5ce9c99fdb44';
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    const r = await fetch(`https://${HOST}/tennis/v2/atp/player?pageSize=5&pageNo=1`,{
      headers:{'x-rapidapi-key':KEY,'x-rapidapi-host':HOST},
      signal: AbortSignal.timeout(10000)
    });
    const text = await r.text();
    return res.json({status:r.status, preview:text.slice(0,500)});
  } catch(e) {
    return res.json({error:e.message, type:e.constructor.name});
  }
}
