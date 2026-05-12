export const config = { maxDuration: 30 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

async function scraperFetch(url, js = false) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}${js ? '&render=true' : ''}`,
    { headers: { Accept: 'text/html' } }
  );
  if (!r.ok) throw new Error(`ScraperAPI ${r.status}`);
  return r.text();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'TenZ' } = req.query;

  try {
    const html = await scraperFetch(`https://www.hltv.org/search?query=${encodeURIComponent(q)}`, true);
    const results = [];
    const rx = /href="\/player\/(\d+)\/([^"?#]+)"/gi;
    let m; const seen = new Set();
    while ((m = rx.exec(html)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); results.push({ id: m[1], slug: m[2] }); }
    }
    return res.json({ q, credits_used: 5, results, html_length: html.length });
  } catch(e) {
    return res.json({ error: e.message, credits_remaining_check: 'Go to scraperapi.com dashboard' });
  }
}
