export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const R = {};

  // Try to find individual match pages by fetching the tournament page
  // and looking for 9z Team vs Legacy match link
  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=parse&page=BetBoom/RUSH_B!_Summit/2026/Part_Three&prop=text&format=json',
      { headers: UA }
    );
    const d = await r.json();
    const html = d.parse?.text?.['*'] || '';

    // Find match links (vs format)
    const vsLinks = [...html.matchAll(/href="\/counterstrike\/([^"]*(?:vs|Vs|VS)[^"]*|[^"]*9z[^"]*|[^"]*Legacy[^"]*)"/gi)]
      .map(m => m[1]).filter(l => !l.includes('#')).slice(0, 10);
    R.vs_links = [...new Set(vsLinks)];

    // Look for any sub-page links within the tournament
    const subLinks = [...html.matchAll(/href="\/counterstrike\/(BetBoom[^"#]+)"/gi)]
      .map(m => m[1]).filter(l => l !== 'BetBoom/RUSH_B!_Summit/2026/Part_Three');
    R.sub_links = [...new Set(subLinks)].slice(0, 10);

    // Look for "dgt" in the page context
    const dgtIdx = html.toLowerCase().indexOf('dgt');
    if (dgtIdx > -1) {
      const context = html.slice(Math.max(0, dgtIdx - 200), dgtIdx + 400)
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      R.dgt_on_tournament_page = context;
    }
  } catch(e) { R.tournament_error = e.message; }

  // Try fetching a specific match sub-page
  const matchPagesToTry = [
    'BetBoom/RUSH_B!_Summit/2026/Part_Three/Grand_Final',
    'BetBoom/RUSH_B!_Summit/2026/Part_Three/Finals',
    'BetBoom/RUSH_B!_Summit/2026/Part_Three/Results',
  ];

  R.match_page_attempts = [];
  for (const page of matchPagesToTry) {
    try {
      const r = await fetch(`https://liquipedia.net/counterstrike/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json`, { headers: UA });
      const d = await r.json();
      const html = d.parse?.text?.['*'] || '';
      const hasDgt = html.toLowerCase().includes('dgt');
      const hasKills = html.toLowerCase().includes('kills') || html.toLowerCase().includes('k/d');
      const hasStats = html.toLowerCase().includes('rating') && hasDgt;
      R.match_page_attempts.push({
        page, status: r.status, hasDgt, hasKills, hasStats,
        length: html.length,
        dgt_context: hasDgt ? html.slice(html.toLowerCase().indexOf('dgt') - 100, html.toLowerCase().indexOf('dgt') + 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
      });
    } catch(e) {
      R.match_page_attempts.push({ page, error: e.message });
    }
  }

  return res.status(200).json(R);
}
