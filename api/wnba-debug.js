export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id || '4433403';

  // Call /api/wnba and read the FULL body regardless of status
  const base = `https://${req.headers.host}/api/wnba`;
  const out = {};

  try {
    const r = await fetch(`${base}?action=gamelog&id=${id}&scope=season`);
    const text = await r.text();
    out.season_status = r.status;
    out.season_body = text.slice(0, 500); // full body — shows the actual error
  } catch(e) { out.season_error = e.message; }

  try {
    const r2 = await fetch(`${base}?action=search&q=clark`);
    const text2 = await r2.text();
    out.search_status = r2.status;
    out.search_body = text2.slice(0, 300);
  } catch(e) { out.search_error = e.message; }

  return res.json(out);
}
