export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gridPost(query, variables) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error: 'GRID_API_KEY not set' };
  const r = await fetch(GRID_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, ok: r.ok, body: json };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { sport = 'cs2' } = req.query;
  const host = req.headers.host;
  const out = { sport };

  if (sport === 'cs2') {
    // Try 5 different GRID query approaches to find what works
    const testName = 'stadodo';
    out.grid_api_key_present = !!process.env.GRID_API_KEY;
    out.attempts = {};

    out.attempts.a_includesInsensitive = await gridPost(`
      query { allPlayers(filter:{nickname:{includesInsensitive:"${testName}"}} first:3){nodes{id nickname}} }
    `, {});

    out.attempts.b_iLike = await gridPost(`
      query { allPlayers(filter:{nickname:{iLike:"%${testName}%"}} first:3){nodes{id nickname}} }
    `, {});

    out.attempts.c_equalTo = await gridPost(`
      query { allPlayers(filter:{nickname:{equalTo:"${testName}"}} first:3){nodes{id nickname}} }
    `, {});

    out.attempts.d_no_filter_first5 = await gridPost(`
      query { allPlayers(first:5){nodes{id nickname}} }
    `, {});

    out.attempts.e_players_field = await gridPost(`
      query { players(first:5){nodes{id nickname}} }
    `, {});

    out.attempts.f_introspection = await gridPost(`
      query { __type(name:"Player"){fields{name type{name}}} }
    `, {});
  }

  if (sport === 'lol') {
    // Test LoL search directly and show what comes back
    const testName = 'Naak Nako';
    out.lol_search = {};

    try {
      const r = await fetch(`https://${host}/api/lol?action=search&q=${encodeURIComponent(testName)}`);
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0,500) }; }
      out.lol_search.status = r.status;
      out.lol_search.body = json;
    } catch(e) { out.lol_search.error = e.message; }

    // Also try a simpler/known player
    const knownName = 'Faker';
    out.lol_search_known = {};
    try {
      const r = await fetch(`https://${host}/api/lol?action=search&q=${encodeURIComponent(knownName)}`);
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0,500) }; }
      out.lol_search_known.status = r.status;
      out.lol_search_known.body = json;
    } catch(e) { out.lol_search_known.error = e.message; }
  }

  return res.json(out);
}
