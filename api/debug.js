export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const R = {};

  try {
    const r = await fetch('https://liquipedia.net/counterstrike/Dgt/Results', { headers: UA });
    const html = await r.text();

    // Find the sortable table
    const tableStart = html.indexOf('table2__table sortable');
    const tableEnd   = html.indexOf('</table>', tableStart);
    const tableHtml  = tableStart > -1 ? html.slice(tableStart - 10, tableEnd + 8) : '';

    R.table_found = tableStart > -1;

    if (tableHtml) {
      // Extract all header cells to see column names
      const headers = [...tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(h => h.length > 0);
      R.column_headers = headers;

      // Extract first 5 data rows
      const rows = [...tableHtml.matchAll(/<tr[^>]*table2__row--body[^>]*>([\s\S]*?)<\/tr>/gi)]
        .slice(0, 5)
        .map(row => {
          const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
            .map(c => c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
          return cells;
        });
      R.first_5_rows = rows;
    }

    // Also fetch one individual match page to see kill stat format
    // Try IEM Dallas 2025 as it's likely to have dgt
    try {
      const mr = await fetch('https://liquipedia.net/counterstrike/Intel_Extreme_Masters/2025/Dallas', { headers: UA });
      const mhtml = await mr.text();
      R.iem_dallas_status = mr.status;
      // Look for dgt in the page
      const dgtIdx = mhtml.toLowerCase().indexOf('dgt');
      if (dgtIdx > -1) {
        R.iem_dallas_dgt_context = mhtml.slice(Math.max(0, dgtIdx - 300), dgtIdx + 500)
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    } catch(e) { R.iem_error = e.message; }

  } catch(e) { R.error = e.message; }

  return res.status(200).json(R);
}
