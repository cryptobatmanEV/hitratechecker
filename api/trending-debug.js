export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const PP_LEAGUE = { lol:'121', cs2:'265', dota:'174' };
const GRID_URL = 'https://api.grid.gg/central-data/graphql';

async function fetchPP(leagueId) {
  const r = await fetch(`https://api.prizepicks.com/projections?league_id=${leagueId}&per_page=250`,
    { headers:{ Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/' } });
  if (!r.ok) throw new Error(`PP ${r.status}`);
  return r.json();
}

async function gridPost(query, variables) {
  const key = process.env.GRID_API_KEY;
  if (!key) throw new Error('GRID_API_KEY not set');
  const r = await fetch(GRID_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`GRID ${r.status}`);
  const d = await r.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport = 'lol' } = req.query;
  const host = req.headers.host;
  const lid = PP_LEAGUE[sport];
  if (!lid) return res.json({ error: 'Use ?sport=lol, cs2, or dota' });

  const out = { sport, steps: {} };

  try {
    // ── STEP 1: PP projections ────────────────────────────────────────────────
    const ppData = await fetchPP(lid);
    const rawProjs = (ppData.data||[]).filter(p=>p.type==='projection');
    const pMap = {};
    for (const inc of ppData.included||[]) {
      if (inc.type==='new_player'||inc.type==='player') {
        pMap[inc.id] = { name:inc.attributes?.display_name||inc.attributes?.name, team:inc.attributes?.team };
      }
    }
    const sampleProj = rawProjs[0];
    const samplePid  = sampleProj?.relationships?.new_player?.data?.id;
    const samplePl   = pMap[samplePid] || {};
    out.steps.step1_pp = {
      raw_proj_count: rawProjs.length,
      pmap_size: Object.keys(pMap).length,
      included_types: [...new Set((ppData.included||[]).map(i=>i.type))],
      sample_stat_type: sampleProj?.attributes?.stat_type,
      sample_line: sampleProj?.attributes?.line_score,
      sample_player_name: samplePl.name,
      sample_player_team: samplePl.team,
      all_stat_types: [...new Set(rawProjs.map(p=>p.attributes?.stat_type))],
    };

    const testName = samplePl.name;
    if (!testName) { out.error='No player name resolved from pMap'; return res.json(out); }

    // ── STEP 2: Player search ─────────────────────────────────────────────────
    if (sport === 'cs2') {
      try {
        const data = await gridPost(`
          query SearchPlayer($name: String!) {
            allPlayers(filter:{nickname:{includesInsensitive:$name}} first:5 orderBy:NICKNAME_ASC) {
              nodes { id nickname }
            }
          }`, { name: testName });
        out.steps.step2_player_search = {
          searched: testName,
          results: data?.allPlayers?.nodes || [],
          grid_api_key_present: !!process.env.GRID_API_KEY,
        };

        // ── STEP 3: CS2 kill log ──────────────────────────────────────────────
        const player = data?.allPlayers?.nodes?.[0];
        if (player) {
          try {
            const seriesData = await gridPost(`
              query PlayerSeries($pid: Long!) {
                allSeries(
                  filter:{hasRosterWithPlayers:{playerId:{equalTo:$pid}} type:{equalTo:ESPORTS}}
                  orderBy:STARTTIME_DESC first:5
                ) {
                  nodes {
                    id startTime
                    games { nodes { teams { nodes { homeTeam name players { nodes { playerId kills } } } } } }
                  }
                }
              }`, { pid: parseInt(player.id) });
            const series = seriesData?.allSeries?.nodes || [];
            out.steps.step3_game_log = {
              series_count: series.length,
              sample_series: series[0] ? {
                id: series[0].id,
                startTime: series[0].startTime,
                games_count: series[0].games?.nodes?.length,
                sample_game_teams: series[0].games?.nodes?.[0]?.teams?.nodes?.map(t=>({
                  name: t.name,
                  player_count: t.players?.nodes?.length,
                  sample_player: t.players?.nodes?.[0],
                })),
              } : null,
            };
          } catch(e) { out.steps.step3_game_log = { error: e.message }; }
        }
      } catch(e) { out.steps.step2_player_search = { error: e.message }; }
    }

    if (sport === 'lol') {
      try {
        const r = await fetch(`https://${host}/api/lol?action=search&q=${encodeURIComponent(testName)}`);
        const d = await r.json();
        const players = Array.isArray(d) ? d : (d.players||[]);
        const found = players[0];
        out.steps.step2_player_search = {
          searched: testName,
          status: r.status,
          result_count: players.length,
          first_result: found || null,
          has_teamId: !!found?.teamId,
          has_leagueName: !!found?.leagueName,
        };

        // ── STEP 3: LoL game log ──────────────────────────────────────────────
        if (found) {
          const { teamId, teamCode, leagueName, playerName, name } = found;
          const pn = playerName||name||testName;
          const url = `https://${host}/api/lol?action=gamelog&teamId=${encodeURIComponent(teamId||'')}&teamCode=${encodeURIComponent(teamCode||'')}&leagueName=${encodeURIComponent(leagueName||'')}&playerName=${encodeURIComponent(pn)}&name=${encodeURIComponent(pn)}`;
          try {
            const lr = await fetch(url);
            const ld = await lr.json();
            const games = Array.isArray(ld) ? ld : (ld.games||[]);
            out.steps.step3_game_log = {
              url_called: url,
              status: lr.status,
              response_type: Array.isArray(ld)?'array':typeof ld,
              game_count: games.length,
              sample_game: games[0] || null,
              has_maps: !!games[0]?.maps,
              maps_length: games[0]?.maps?.length,
            };

            // ── STEP 4: stat resolution ───────────────────────────────────────
            if (games[0] && sampleProj?.attributes?.stat_type) {
              const statType = sampleProj.attributes.stat_type;
              const mapM = statType.match(/^MAP\s+(\d+)\s+(.+)$/i);
              const mapsM = statType.match(/^MAPS\s+(\d+)-(\d+)\s+(.+)$/i);
              let val = null;
              if (mapM) {
                const idx = parseInt(mapM[1])-1;
                const base = mapM[2].trim().toLowerCase();
                val = games[0].maps?.[idx]?.[base] ?? `no maps[${idx}] or no field '${base}'`;
              } else if (mapsM) {
                val = 'range pattern matched — needs implementation check';
              } else {
                val = games[0][statType.toLowerCase()] ?? `no direct field '${statType}'`;
              }
              out.steps.step4_stat_calc = { stat_type: statType, line: sampleProj.attributes.line_score, first_game_value: val };
            }
          } catch(e) { out.steps.step3_game_log = { error: e.message }; }
        }
      } catch(e) { out.steps.step2_player_search = { error: e.message }; }
    }

  } catch(e) { out.error = e.message; }

  return res.json(out);
}
