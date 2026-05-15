export const config = { maxDuration: 30 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

async function scraperFetch(url) {
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}`,
    { headers: { Accept: 'text/html' } }
  );
  return r.text();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now()-180*86400000).toISOString().split('T')[0];
  const html = await scraperFetch(
    `https://www.hltv.org/stats/players?startDate=${start}&endDate=${end}`
  );

  // Test multiple regex patterns to find what actually works
  const results = {};

  // Pattern 1: current pattern
  const rx1 = /href="\/stats\/players\/(\d+)\/([^"?#\/]+)"/gi;
  const m1 = []; let m;
  while((m=rx1.exec(html))!==null) m1.push({id:m[1],slug:m[2]});
  results.pattern1_stats_players = m1.slice(0,10);

  // Pattern 2: player profile links
  const rx2 = /href="\/player\/(\d+)\/([^"?#\/]+)"/gi;
  const m2 = []; 
  while((m=rx2.exec(html))!==null) m2.push({id:m[1],slug:m[2]});
  results.pattern2_player_links = m2.slice(0,10);

  // Show raw HTML snippet to see what links look like
  results.html_sample = html.substring(0, 500);
  results.html_length = html.length;
  
  // Search for "Techno" anywhere in the page
  const technoIdx = html.toLowerCase().indexOf('techno');
  results.techno_found_at = technoIdx;
  if (technoIdx > 0) results.techno_context = html.substring(technoIdx-100, technoIdx+200);

  return res.json(results);
}
