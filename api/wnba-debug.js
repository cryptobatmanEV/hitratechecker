export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  const get = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url.replace('http://','https://'), {
        headers: { 'User-Agent': UA },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return r.json();
    } catch(e) {
      clearTimeout(t);
      return { error: e.message };
    }
  };

  // Confirmed working competition URL from previous debug
  const comp = await get(
    'https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/events/401856893/competitions/401856893'
  );

  if (comp.error) return res.json({ failed: comp.error });

  const c0 = comp.competitors?.[0];
  const c1 = comp.competitors?.[1];

  return res.json({
    comp_date: comp.date,
    comp_name: comp.name,         // e.g. "Dallas Wings at Indiana Fever"
    comp_status: comp.status,
    c0_id:       c0?.id,
    c0_homeAway: c0?.homeAway,
    c0_winner:   c0?.winner,      // boolean or $ref?
    c0_score:    c0?.score,       // inline {value} or {$ref}?
    c0_team:     c0?.team,        // inline {displayName} or {$ref}?
    c1_id:       c1?.id,
    c1_homeAway: c1?.homeAway,
    c1_winner:   c1?.winner,
    c1_score:    c1?.score,
    c1_team:     c1?.team,
  });
}
