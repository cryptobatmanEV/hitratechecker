export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing url param' });

  // Only allow NHL domains
  const allowed = ['api-web.nhle.com', 'search.d3.nhle.com', 'suggest.svc.nhl.com'];
  const isAllowed = allowed.some(d => url.includes(d));
  if (!isAllowed) return res.status(403).json({ error: 'Domain not allowed' });

  try {
    const r = await fetch(decodeURIComponent(url));
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
