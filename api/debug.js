export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const R = {};

  // Use action=parse with prop=text to get RENDERED HTML including template output
  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=parse&page=Dgt/Results&prop=text&format=json',
      { headers: UA }
    );
    const d = await r.json();
    const html = d.parse?.text?.['*'] || '';
    R.rendered_length = html.length;

    // Search with encoded underscores
    const tableIdx = html.indexOf('table2&#95;&#95;table');
    const tableIdx2 = html.indexOf('table2__table');
    R.table_encoded_found = tableIdx > -1;
    R.table_plain_found = tableIdx2 > -1;

    // Try to find rows
    const rowMatches = [...html.matchAll(/table2[^"]*row--body[^>]*>([\s\S]*?)<\/tr>/gi)];
    R.row_count = rowMatches.length;

    if (rowMatches.length > 0) {
      // Extract first 3 rows with cell text
      R.first_3_rows = rowMatches.slice(0, 3).map(row =>
        [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
          .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim())
      );
    }

    // Get header cells
    const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim())
      .filter(h => h.length > 0 && h.length < 30);
    R.headers = headers.slice(0, 15);

    // Sample the raw HTML around table
    const tIdx = Math.max(tableIdx, tableIdx2);
    if (tIdx > -1) R.table_sample = html.slice(tIdx, tIdx + 1000);

  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
