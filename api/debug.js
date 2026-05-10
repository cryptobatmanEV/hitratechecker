export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const R = {};

  // Fetch dgt results page and find the actual table structure
  try {
    const r = await fetch('https://liquipedia.net/counterstrike/Dgt/Results', { headers: UA });
    const html = await r.text();

    // Find table classes actually used
    const tableClasses = [...html.matchAll(/class="([^"]*table[^"]*)"/gi)].map(m => m[1]);
    R.table_classes = [...new Set(tableClasses)].slice(0, 10);

    // Find all <table class= patterns
    const allTableTags = [...html.matchAll(/<table[^>]*class="([^"]*)"/gi)].map(m => m[1]);
    R.all_table_classes = [...new Set(allTableTags)].slice(0, 10);

    // Look for match/tournament links - find /counterstrike/ links
    const matchLinks = [...html.matchAll(/href="\/counterstrike\/([^"]+)"/g)]
      .map(m => m[1])
      .filter(l => l.includes('_vs_') || l.includes('2026') || l.includes('2025'))
      .slice(0, 10);
    R.match_links = matchLinks;

    // Look for rating patterns (HLTV rating like 1.23)
    const ratingMatterns = [...html.matchAll(/(\d+\.\d{2})/g)].map(m => m[1]).slice(0, 10);
    R.rating_patterns = ratingMatterns;

    // Grab HTML around any "result" divs
    const resultIdx = html.indexOf('result-');
    if (resultIdx > -1) R.result_sample = html.slice(resultIdx, resultIdx + 500);

    // Look for "kills" or "K" column headers
    const killIdx = html.toLowerCase().indexOf('"kills"');
    if (killIdx > -1) R.kills_sample = html.slice(killIdx - 100, killIdx + 300);

    // Grab first 3000 chars after <main or <article
    const mainIdx = html.indexOf('<main');
    if (mainIdx > -1) R.main_sample = html.slice(mainIdx, mainIdx + 2000);

  } catch(e) { R.error = e.message; }

  // Also fetch a specific recent CS2 match page to see kill stats structure
  try {
    const r = await fetch('https://liquipedia.net/counterstrike/BLAST/Premier/2026/Spring/Groups', { headers: UA });
    R.blast_page_status = r.status;
    const html = await r.text();
    R.blast_is_cloudflare = html.includes('Just a moment');
    // Look for player stats format
    const statsIdx = html.indexOf('dgt');
    if (statsIdx > -1) R.blast_dgt_context = html.slice(Math.max(0, statsIdx - 200), statsIdx + 500);
  } catch(e) { R.blast_error = e.message; }

  return res.status(200).json(R);
}
