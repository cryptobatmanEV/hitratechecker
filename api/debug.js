export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KEY = process.env.FACEIT_API_KEY;
  const BASE = 'https://open.faceit.com/data/v4';
  const R = {};

  const DGT_ID = 'c5c4eb5b-0173-4660-8d95-f189f36dc571';

  // 1. Find what teams dgt belongs to on FACEIT
  try {
    const r = await fetch(`${BASE}/players/${DGT_ID}/teams`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d = await r.json();
    R.player_teams = d;
  } catch(e) { R.teams_error = e.message; }

  // 2. Search for FURIA as a FACEIT team
  try {
    const r = await fetch(`${BASE}/teams/search?game=cs2&name=FURIA&limit=5`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d = await r.json();
    R.furia_search = (d.items || []).map(t => ({ id: t.team_id, name: t.nickname, members: t.members?.length }));
  } catch(e) { R.furia_error = e.message; }

  // 3. Search for recent ESL/BLAST championships on FACEIT
  try {
    const r = await fetch(`${BASE}/championships/search?game=cs2&name=ESL Pro League&limit=3`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d = await r.json();
    R.esl_championships = (d.items || []).map(c => ({ id: c.championship_id, name: c.name, status: c.status }));
  } catch(e) { R.esl_error = e.message; }

  // 4. Also try searching for BLAST
  try {
    const r = await fetch(`${BASE}/championships/search?game=cs2&name=BLAST&limit=3`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d = await r.json();
    R.blast_championships = (d.items || []).map(c => ({ id: c.championship_id, name: c.name, status: c.status }));
  } catch(e) { R.blast_error = e.message; }

  return res.status(200).json(R);
}
