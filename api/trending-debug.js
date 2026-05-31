export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function gridPost(query, variables={}) {
  const key = process.env.GRID_API_KEY;
  if (!key) return { error:'GRID_API_KEY not set' };
  const r = await fetch(GRID_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ query, variables }),
  });
  const text = await r.text();
  let json; try{json=JSON.parse(text);}catch{json={raw:text.slice(0,300)};}
  return { status:r.status, ok:r.ok, body:json };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='cs2' } = req.query;
  const host = req.headers.host;
  const out = { sport };

  if (sport === 'cs2') {
    const testName = 'stadodo';
    out.key_present = !!process.env.GRID_API_KEY;

    // Test the correct GRID query (players + edges)
    out.players_edges = await gridPost(`
      query { players(filter:{nickname:{includesInsensitive:"${testName}"}} first:5) {
        edges { node { id nickname } }
      }}
    `);

    // Try allSeries (confirmed working in cs2.js)
    const pid = out.players_edges?.body?.data?.players?.edges?.[0]?.node?.id;
    if (pid) {
      out.found_player_id = pid;
      out.series_test = await gridPost(`
        query PlayerSeries($pid: Long!) {
          allSeries(filter:{hasRosterWithPlayers:{playerId:{equalTo:$pid}} type:{equalTo:ESPORTS}}
            orderBy:STARTTIME_DESC first:3) {
            nodes { id startTime
              games { nodes { teams { nodes { name homeTeam
                players { nodes { playerId kills } }
              }}}}
            }
          }
        }
      `, { pid: parseInt(pid) });
    }
  }

  if (sport === 'lol') {
    // Verify LoL search now works with name= param
    for (const testName of ['Naak Nako','Faker','Yeon']) {
      try {
        const r = await fetch(`https://${host}/api/lol?action=search&name=${encodeURIComponent(testName)}`);
        const d = await r.json();
        out[`search_${testName.replace(' ','_')}`] = { status:r.status, players:(d.players||[]).slice(0,2) };
        // If found, test game log
        const p = d.players?.[0];
        if (p) {
          const pn = p.playerName||p.name;
          const url = `https://${host}/api/lol?action=gamelog&teamId=${p.teamId}&teamCode=${p.teamCode||''}&leagueName=${encodeURIComponent(p.leagueName||'')}&playerName=${encodeURIComponent(pn)}&name=${encodeURIComponent(pn)}`;
          const gr = await fetch(url);
          const gd = await gr.json();
          const games = Array.isArray(gd)?gd:(gd.games||[]);
          out[`gamelog_${testName.replace(' ','_')}`] = {
            status:gr.status, count:games.length,
            sample:games[0]||null, has_maps:!!games[0]?.maps, maps_len:games[0]?.maps?.length
          };
        }
      } catch(e) { out[`search_${testName}`] = { error:e.message }; }
    }
  }

  return res.json(out);
}
