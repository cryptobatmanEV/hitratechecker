export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const HEADERS = { 'User-Agent': 'EV Cave Hit Rate Tool/1.0 (contact@theevcave.com)' };
  const R = {};

  // Get dgt's Results page wikitext
  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=parse&page=Dgt/Results&prop=wikitext&format=json',
      { headers: HEADERS }
    );
    const d = await r.json();
    const wikitext = d.parse?.wikitext?.['*'] || '';
    R.dgt_results_status = r.status;
    R.dgt_results_sample = wikitext.slice(0, 1500);
    R.wikitext_length = wikitext.length;
  } catch(e) { R.dgt_results_error = e.message; }

  // Also get NiKo's Results page
  try {
    const r = await fetch(
      'https://liquipedia.net/counterstrike/api.php?action=parse&page=NiKo/Results&prop=wikitext&format=json',
      { headers: HEADERS }
    );
    const d = await r.json();
    const wikitext = d.parse?.wikitext?.['*'] || '';
    R.niko_results_status = r.status;
    R.niko_results_sample = wikitext.slice(0, 1500);
  } catch(e) { R.niko_results_error = e.message; }

  return res.status(200).json(R);
}
