export const config = { maxDuration: 10 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Fetch without contextIds — pure match stats page
  const url = 'https://www.hltv.org/stats/matches/mapstatsid/228816/5star-vs-flyquest';
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  const html = await r.text();

  // Look for hs/headshot patterns
  const patterns = {
    kd_hs: (html.match(/\d+\s*\(\d+\)/g) || []).slice(0, 10),
    headshot_word: html.toLowerCase().includes('headshot'),
    hs_class: (html.match(/class="[^"]*hs[^"]*"/gi) || []).slice(0, 5),
    story_row: (html.match(/story[\s\S]{0,400}/i) || ['not found'])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300),
    table_classes: (html.match(/class="[^"]*stats[^"]*table[^"]*"/gi) || []).slice(0, 5),
  };

  return res.json({ status: r.status, html_length: html.length, patterns });
}
