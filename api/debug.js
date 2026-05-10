export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml'
  };
  const R = {};

  // Fetch the rendered HTML results page for dgt
  try {
    const r = await fetch('https://liquipedia.net/counterstrike/Dgt/Results', { headers: HEADERS });
    R.status = r.status;
    const html = await r.text();
    R.length = html.length;

    // Look for the results table
    const tableStart = html.indexOf('wikitable');
    const tableEnd   = html.indexOf('</table>', tableStart);
    R.has_table = tableStart > -1;

    if (tableStart > -1) {
      // Grab a slice around the table to see structure
      R.table_sample = html.slice(Math.max(0, tableStart - 50), Math.min(html.length, tableStart + 2000));
    }

    // Also look for kill stats patterns
    const killPattern = html.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/g);
    R.kda_patterns_found = killPattern ? killPattern.slice(0, 5) : [];

    // Check for Cloudflare block
    R.is_cloudflare = html.includes('Just a moment') || html.includes('cf-browser-verification');

  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
