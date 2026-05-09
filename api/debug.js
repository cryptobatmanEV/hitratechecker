export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const R = { timestamp: new Date().toISOString() };

  // Show ALL championship competition names for NiKo (top EU player)
  // and nython (SA player) so we can see the tier difference
  async function getChampionships(nickname) {
    const sr = await fetch(`https://open.faceit.com/data/v4/players?nickname=${nickname}&game=cs2`, {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const sd = await sr.json();
    const pid = sd.player_id;
    if (!pid) return { error: 'not found' };

    const hr = await fetch(`https://open.faceit.com/data/v4/players/${pid}/history?game=cs2&limit=40&offset=0`, {
      headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}` }
    });
    const hd = await hr.json();
    const champ = (hd.items || []).filter(m => m.competition_type === 'championship' || m.competition_type === 'hub');
    return champ.map(m => m.competition_name).filter((v,i,a) => a.indexOf(v) === i); // unique names
  }

  try { R.nython_competitions = await getChampionships('nython'); } catch(e) { R.nython_error = e.message; }
  try { R.niko_competitions   = await getChampionships('NiKo');   } catch(e) { R.niko_error   = e.message; }

  // Also test the LoL endpoint directly to confirm it's accessible
  try {
    const r = await fetch(`https://${req.headers.host}/api/lol?action=search&name=ShowMaker`);
    R.lol_endpoint = { status: r.status, preview: (await r.text()).slice(0, 150) };
  } catch(e) { R.lol_endpoint_error = e.message; }

  return res.status(200).json(R);
}
