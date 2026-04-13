export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { path, params } = req.query;
  const BDL_KEY = '296a4c03-94ec-4cfd-a472-8e4d464c9167';
  const url = `https://api.balldontlie.io/v1/${path}?${params || ''}`;

  try {
    const r = await fetch(url, { headers: { Authorization: BDL_KEY } });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
