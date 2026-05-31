export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gridPost(query, variables) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error: 'No GRID_API_KEY' };
  const r = await fetch(GRID_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ query, variables }),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0,300) }; }
  return { status: r.status, ok: r.ok, body: json };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='cs2' } = req.query;
  const host = req.headers.host;
  const out = { sport };

  if (sport === 'cs2') {
    out.grid_key = !!process.env.GRID_API_KEY;
    out.attempts = {};

    // Test 1: correct field name (players not allPlayers), correct edges pattern
    out.attempts.a_players_edges_no_filter = await gridPost(
      `query { players(first:3){edges{node{id nickname}}} }`, {}
    );

    // Test 2: with eq filter
    out.attempts.b_players_eq = await gridPost(
      `query($v:String!){players(filter:{nickname:{eq:$v}} first:3){edges{node{id nickname}}}}`,
      {v:'stadodo'}
    );

    // Test 3: with equalTo filter
    out.attempts.c_players_equalTo = await gridPost(
      `query($v:String!){players(filter:{nickname:{equalTo:$v}} first:3){edges{node{id nickname}}}}`,
      {v:'stadodo'}
    );

    // Test 4: with contains/like filter
    out.attempts.d_players_like = await gridPost(
      `query($v:String!){players(filter:{nickname:{like:$v}} first:3){edges{node{id nickname}}}}`,
      {v:'%stado%'}
    );

    // Test 5: introspect players query args to find valid filter operators
    out.attempts.e_introspect_players_args = await gridPost(
      `query{__schema{queryType{fields{name args{name type{name kind ofType{name}}}}}}}`, {}
    );
  }

  if (sport === 'lol') {
    // Test LoL with correct ?name= param (was ?q= before which caused the crash)
    const testName = 'Faker';
    try {
      const r = await fetch(`https://${host}/api/lol?action=search&name=${encodeURIComponent(testName)}`);
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0,500) }; }
      out.lol_search_faker = { status: r.status, body: json };
    } catch(e) { out.lol_search_faker = { error: e.message }; }

    // Also test what PP stat types look like for LoL and check resolveStatFn
    out.stat_type_check = {
      'MAP 4 Kills': !!('MAP 4 Kills'.match(/^MAP\s+(\d+)\s+(.+)$/i)),
      'MAPS 1-3 Kills': !!('MAPS 1-3 Kills'.match(/^MAPS\s+(\d+)-(\d+)\s+(.+)$/i)),
      'MAPS 1-3 Kills (Combo)': !!('MAPS 1-3 Kills (Combo)'.match(/^MAPS\s+(\d+)-(\d+)\s+(.+)$/i)),
    };
  }

  return res.json(out);
}
