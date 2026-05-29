export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id || '4433403';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  const get = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url.replace('http://','https://'), { headers:{'User-Agent':UA}, signal:ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return r.json();
    } catch(e) { clearTimeout(t); return { error: e.message }; }
  };

  const year = new Date().getFullYear();
  const out = { id, year };

  // Directly call /api/wnba for season and career
  // and show raw responses
  try {
    const base = `https://${req.headers.host}/api/wnba`;

    const sR = await get(`${base}?action=gamelog&id=${id}&scope=season`);
    out.season_response = {
      is_array: Array.isArray(sR),
      length: Array.isArray(sR) ? sR.length : null,
      error: sR?.error || null,
      sample: Array.isArray(sR) ? sR[0] : sR,
    };

    const cR = await get(`${base}?action=gamelog&id=${id}&scope=career`);
    out.career_response = {
      is_array: Array.isArray(cR),
      length: Array.isArray(cR) ? cR.length : null,
      error: cR?.error || null,
      sample: Array.isArray(cR) ? cR[0] : cR,
    };
  } catch(e) {
    out.fetch_error = e.message;
  }

  // Also test the eventlog URLs directly to check naming
  const el2026 = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2026/athletes/${id}/eventlog?limit=5`);
  out.eventlog_2026 = { status_ok: !el2026.error, count: el2026.events?.count, items: el2026.events?.items?.length, error: el2026.error };

  const el2025 = await get(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/2025/athletes/${id}/eventlog?limit=5`);
  out.eventlog_2025 = { status_ok: !el2025.error, count: el2025.events?.count, items: el2025.events?.items?.length, error: el2025.error };

  return res.json(out);
}
