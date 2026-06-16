export const config = { maxDuration: 20 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function check(url, headers={}) {
  try {
    const r = await fetch(url, {headers:{'User-Agent':UA,...headers}, signal:AbortSignal.timeout(8000)});
    const text = await r.text();
    return {status:r.status, len:text.length, has_datadome: !!r.headers.get('x-datadome'), preview:text.slice(0,200)};
  } catch(e) { return {error:e.message}; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. The actual board webpage (not the API) - might embed JSON without DataDome blocking it
  out.board_page = await check('https://app.prizepicks.com/board');

  // 2. PP's public-facing marketing/main site (different infra, possibly no DataDome)
  out.main_site = await check('https://www.prizepicks.com/');

  // 3. Try the partner/affiliate API subdomain pattern some sites use
  out.partner_api = await check('https://partner-api.prizepicks.com/projections?league_id=7&per_page=5');

  // 4. Try without query params - sometimes DataDome rules target specific query patterns
  out.no_params = await check('https://api.prizepicks.com/projections');

  // 5. Try the leagues endpoint (lighter weight, used earlier in this project for league IDs)
  out.leagues_endpoint = await check('https://api.prizepicks.com/leagues');

  return res.json(out);
}
