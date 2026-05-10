export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = process.env.FACEIT_API_KEY;
  const BASE = 'https://open.faceit.com/data/v4';
  const R = {};

  // 1. Browse FACEIT championships directly (not by name search)
  try {
    const r = await fetch(`${BASE}/championships?game=cs2&type=recent&offset=0&limit=10`, {
      headers: { Authorization: `Bearer ${KEY}` }
    });
    const d = await r.json();
    R.faceit_championships_browse = (d.items || []).map(c => ({
      id: c.championship_id,
      name: c.name,
      status: c.status,
      organizer: c.organizer_id
    }));
  } catch(e) { R.faceit_browse_error = e.message; }

  // 2. Liquipedia CS2 API - get dgt's recent matches with stats
  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=ask&format=json&query=[[Player::dgt]]|?Kills|?Deaths|?Assists|?Team|limit=5',
      { headers: { 'User-Agent': 'EV Cave Hit Rate Tool/1.0 (contact@theevcave.com)' } }
    );
    const d = await r.json();
    R.liquipedia_player = { status: r.status, results: Object.keys(d.query?.results || {}).slice(0, 3) };
  } catch(e) { R.liquipedia_error = e.message; }

  // 3. Liquipedia parse API - get match stats from a specific page
  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=parse&page=FURIA_Esports&format=json&prop=sections',
      { headers: { 'User-Agent': 'EV Cave Hit Rate Tool/1.0 (contact@theevcave.com)' } }
    );
    R.liquipedia_parse_status = r.status;
    if (r.ok) {
      const d = await r.json();
      R.liquipedia_parse = { title: d.parse?.title, sections: d.parse?.sections?.length };
    } else {
      R.liquipedia_parse_error = await r.text().then(t => t.slice(0, 200));
    }
  } catch(e) { R.liquipedia_parse_error = e.message; }

  // 4. SportDevs - test CS2 endpoint
  try {
    const r = await fetch('https://esports.sportdevs.com/matches?sport_id=eq.cs2&limit=3', {
      headers: { 'Accept': 'application/json' }
    });
    R.sportdevs = { status: r.status, preview: (await r.text()).slice(0, 300) };
  } catch(e) { R.sportdevs_error = e.message; }

  // 5. Try FACEIT open data endpoint for ESL org
  try {
    const r = await fetch(`${BASE}/organizers/search?name=ESL&offset=0&limit=5`, {
      headers: { Authorization: `Bearer ${KEY}` }
    });
    const d = await r.json();
    R.esl_organizer = (d.items || []).map(o => ({ id: o.organizer_id, name: o.name }));
  } catch(e) { R.esl_org_error = e.message; }

  // 6. If ESL organizer found, get their championships
  if (R.esl_organizer?.length) {
    try {
      const orgId = R.esl_organizer[0].id;
      const r = await fetch(`${BASE}/organizers/${orgId}/championships?game=cs2&limit=5`, {
        headers: { Authorization: `Bearer ${KEY}` }
      });
      const d = await r.json();
      R.esl_championships_via_org = (d.items || []).map(c => ({ id: c.championship_id, name: c.name, status: c.status }));
    } catch(e) { R.esl_org_champ_error = e.message; }
  }

  return res.status(200).json(R);
}
