export const config = { maxDuration: 10 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'TenZ' } = req.query;

  // render=false is fast (1 credit, ~3s) — check if HLTV SSR includes any player links
  try {
    const r = await fetch(
      `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(`https://www.hltv.org/search?query=${q}`)}&render=false`,
      { headers: { Accept: 'text/html' } }
    );
    const text = await r.text();
    const ids = [];
    const rx = /href="\/player\/(\d+)\/([^"?#]+)"/gi;
    let m;
    while ((m = rx.exec(text)) !== null) ids.push({ id: m[1], slug: m[2] });
    return res.json({ status: r.status, html_length: text.length, player_links: ids.slice(0, 10) });
  } catch(e) {
    return res.json({ error: e.message });
  }
}
