export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;

  // Call actual trending for NFL and show full debug
  const r = await fetch(`https://${host}/api/trending?sport=nfl`);
  const d = await r.json();
  return res.json({ debug: d.debug, result_count: (d.results||[]).length, first: d.results?.[0] });
}
