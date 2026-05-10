export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const R = {};

  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=parse&page=Dgt/Results&prop=text&format=json',
      { headers: UA }
    );
    const d = await r.json();
    const html = d.parse?.text?.['*'] || '';

    // Extract ALL links from table rows with their surrounding context
    const rowMatches = [...html.matchAll(/table2[^"]*row--body[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 10);

    R.rows_with_links = rowMatches.map(row => {
      const links = [...row[1].matchAll(/href="\/counterstrike\/([^"]+)"/gi)].map(m => m[1]);
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim());
      return { links, cells: cells.filter(c => c.length > 0) };
    });

    // Find match-specific links (containing _vs_ or specific match format)
    const allLinks = rowMatches.flatMap(row =>
      [...row[1].matchAll(/href="\/counterstrike\/([^"#]+)"/gi)].map(m => m[1])
    );
    R.unique_links = [...new Set(allLinks)].slice(0, 15);

    // Fetch the first meaningful tournament/match link
    const matchLink = allLinks.find(l => l.includes('2026') || l.includes('2025'));
    if (matchLink) {
      R.fetching = matchLink;
      const mr = await fetch(`https://liquipedia.net/counterstrike/${matchLink}`, { headers: UA });
      const mhtml = await mr.text();
      R.match_status = mr.status;

      // Look for dgt in this page with surrounding stats
      const idx = mhtml.toLowerCase().indexOf('dgt');
      if (idx > -1) {
        // Get text around dgt mention, strip tags
        const raw = mhtml.slice(Math.max(0, idx - 500), idx + 500);
        R.dgt_context = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // Look for kill/death patterns near player stats
      const killPatterns = [...mhtml.matchAll(/(\d{1,3})\s*<\/td>\s*<td[^>]*>\s*(\d{1,3})\s*<\/td>/g)]
        .slice(0, 5).map(m => `${m[1]}/${m[2]}`);
      R.kill_death_cells = killPatterns;

      // Look for "Kills" header
      R.has_kills_header = mhtml.toLowerCase().includes('kills');
      R.has_rating_header = mhtml.toLowerCase().includes('rating');
    }
  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
