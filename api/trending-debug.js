export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;
  const out = {};

  // Step 1: what does trending return for NFL right now?
  const t = await fetch(`https://${host}/api/trending?sport=nfl`);
  const td = await t.json();
  out.trending_debug = td.debug;

  // Step 2: manually test findPlayer + fetchLog for Drake Maye
  const sr = await fetch(`https://${host}/api/nfl?action=search&q=Drake+Maye`);
  const sd = await sr.json();
  out.search_result = sd[0] || sd;

  const pid = (Array.isArray(sd)?sd:[])[0]?.id;
  if (pid) {
    const t1 = Date.now();
    const gr = await fetch(`https://${host}/api/nfl?action=gamelog&id=${pid}`);
    out.gamelog_ms = Date.now()-t1;
    out.gamelog_status = gr.status;
    const gd = await gr.json().catch(()=>({error:'parse fail'}));
    const games = Array.isArray(gd)?gd:(gd.games||[]);
    out.gamelog_count = games.length;
    out.gamelog_sample = games[0];
  }

  return res.json(out);
}
