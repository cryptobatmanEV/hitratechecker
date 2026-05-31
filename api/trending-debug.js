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
  const { sport='nba' } = req.query;
  const out = { sport };

  if (sport === 'nba') {
    // Show full attributes for first 3 projections — find the demon fields
    const r = await fetch('https://api.prizepicks.com/projections?league_id=7&per_page=20',
      { headers:{ Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/' }});
    const d = await r.json();
    out.pp_status = r.status;

    // Show all projection_type items from included
    const projTypes = (d.included||[]).filter(i=>i.type==='projection_type');
    out.projection_types = projTypes.map(pt=>({ id:pt.id, attributes:pt.attributes }));

    // Show full attributes for first 5 projections
    out.sample_projections = (d.data||[]).filter(p=>p.type==='projection').slice(0,5).map(p=>({
      stat_type: p.attributes?.stat_type,
      line: p.attributes?.line_score,
      proj_type_id: p.relationships?.projection_type?.data?.id,
      // Show ALL attributes so we can find demon fields
      all_attributes: p.attributes,
    }));
  }

  if (sport === 'cs2') {
    out.key_present = !!process.env.GRID_API_KEY;

    // Test the batch approach — get allSeries and show player data
    const result = await gridPost(`
      query RecentSeries {
        allSeries(
          filter: { type: { equalTo: ESPORTS } }
          orderBy: STARTTIME_DESC
          first: 5
        ) {
          nodes {
            id startTime
            games { nodes {
              teams { nodes {
                name
                players { nodes { playerId nickname kills } }
              }}
            }}
          }
        }
      }
    `);
    out.batch_test = {
      status: result.status,
      series_count: result.body?.data?.allSeries?.nodes?.length,
      sample_series: result.body?.data?.allSeries?.nodes?.[0] ? {
        id: result.body.data.allSeries.nodes[0].id,
        startTime: result.body.data.allSeries.nodes[0].startTime,
        games_count: result.body.data.allSeries.nodes[0].games?.nodes?.length,
        sample_game_teams: result.body.data.allSeries.nodes[0].games?.nodes?.[0]?.teams?.nodes?.map(t=>({
          name: t.name,
          player_count: t.players?.nodes?.length,
          players: t.players?.nodes?.slice(0,3),
        })),
      } : null,
      error: result.body?.errors?.[0]?.message,
    };
  }

  return res.json(out);
}
