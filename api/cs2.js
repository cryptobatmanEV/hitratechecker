export const config = { maxDuration: 30 };

const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const r = await fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['GET',key]) });
    const d = await r.json(); return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}
async function kvSet(key, val) {
  if (!KV_URL) return;
  try { await fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['SETEX',key,86400,JSON.stringify(val)]) }); } catch {}
}
async function cdQ(query) {
  const r = await fetch(CD, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query}) });
  return r.json();
}
async function stQ(query) {
  const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, playerId } = req.query;
  const nickname = req.query.nickname || req.query.q || '';

  try {
    // ── SEARCH ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      const safe = nickname.replace(/"/g,'');
      for (const f of [`equals: "${safe}"`, `contains: "${safe}"`]) {
        const d = await cdQ(`{ players(filter:{nickname:{${f}}},first:10){ edges{node{id nickname title{id} team{id name}}} } }`);
        const all = d?.data?.players?.edges?.map(e => e.node) || [];
        if (!all.length) continue;

        const groups = {};
        for (const p of all) { const k=p.nickname.toLowerCase(); if(!groups[k])groups[k]=[]; groups[k].push(p); }

        const players = [];
        for (const profiles of Object.values(groups)) {
          const csgo = profiles.find(p => p.title?.id === '1');
          const cs2  = profiles.find(p => p.title?.id === '28');
          const any  = profiles[0];
          // CS:GO profile for stats (has data), CS2 profile for current team
          const statsId  = csgo?.id || cs2?.id || any.id;
          const teamId   = cs2?.team?.id   || csgo?.team?.id   || any.team?.id;
          const teamName = cs2?.team?.name  || csgo?.team?.name  || any.team?.name || 'N/A';
          if (statsId) players.push({ id:`grid_${statsId}_${teamId||'0'}`, name:any.nickname, sub:`CS2 · ${teamName}` });
        }
        if (players.length) return res.json({ players });
      }
      return res.json({ players: [] });
    }

    // ── GAMELOG ───────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts   = (playerId||'').split('_');
      const statsId = parts[1];
      const teamId  = parts[2];
      if (!statsId) return res.status(400).json({ error:'Invalid ID' });

      const today    = new Date().toISOString().split('T')[0];
      const cacheKey = `grid_v3_${statsId}_${today}`;
      const cached   = await kvGet(cacheKey);
      if (cached) return res.json({ games: cached });

      // Step 1: overall yearly stats + all confirmed series IDs (1 request)
      const sd = await stQ(`{
        playerStatistics(playerId:"${statsId}", filter:{timeWindow:LAST_YEAR}) {
          aggregationSeriesIds
          series {
            count kills{sum} deaths{sum} won{value count}
            ...on CsgoPlayerSeriesStatistics { headshots{sum} }
          }
        }
      }`);

      const ps  = sd?.data?.playerStatistics;
      const ids = ps?.aggregationSeriesIds || [];
      if (!ids.length) return res.json({ games:[] });

      const tot   = ps.series?.count || 1;
      const avgK  = Math.round((ps.series?.kills?.sum  || 0) / tot);
      const avgD  = Math.round((ps.series?.deaths?.sum || 0) / tot);
      const avgHS = Math.round((ps.series?.headshots?.sum || 0) / tot);

      // Step 2: fetch ALL series metadata in parallel batches of 15
      // then sort by date to always get the most recent games
      const batches = [];
      for (let i = 0; i < ids.length; i += 15) batches.push(ids.slice(i, i+15));

      const batchResults = await Promise.all(batches.map(async (chunk, bi) => {
        const fields = chunk.map((id,j) =>
          `s${bi*15+j}: series(id:"${id}") { id startTimeScheduled tournament{id} teams{baseInfo{id name}} }`
        ).join('\n');
        const md = await cdQ(`{ ${fields} }`);
        return Object.values(md?.data || {}).filter(Boolean);
      }));

      // Sort ALL series by date, take 30 most recent
      const allMeta = batchResults.flat()
        .filter(s => s.startTimeScheduled)
        .sort((a,b) => new Date(b.startTimeScheduled) - new Date(a.startTimeScheduled))
        .slice(0, 30);

      // Step 3: per-tournament stats in parallel for all unique tournaments
      // More tournaments = closer to per-series accuracy
      const tourIds = [...new Set(allMeta.map(s => s.tournament?.id).filter(Boolean))].slice(0, 8);
      const tourResults = await Promise.allSettled(tourIds.map(tid =>
        stQ(`{
          playerStatistics(playerId:"${statsId}", filter:{tournamentIds:{in:["${tid}"]}}) {
            aggregationSeriesIds
            series { count kills{sum} deaths{sum} won{value count}
              ...on CsgoPlayerSeriesStatistics { headshots{sum} }
            }
          }
        }`)
      ));

      const tStats = {};
      tourIds.forEach((tid, i) => {
        const r = tourResults[i];
        if (r.status === 'fulfilled') {
          const ts = r.value?.data?.playerStatistics;
          if ((ts?.series?.count || 0) > 0) tStats[tid] = ts;
        }
      });

      // Step 4: build games — use tournament stats when available, overall avg as fallback
      const games = allMeta.map(series => {
        const opp = series.teams?.find(t => t.baseInfo?.id !== teamId)?.baseInfo?.name || '?';
        const ts  = tStats[series.tournament?.id];
        let kills=avgK, deaths=avgD, headshots=avgHS, win=null;

        if (ts) {
          const tc  = ts.series?.count || 1;
          kills     = Math.round((ts.series?.kills?.sum  || 0) / tc);
          deaths    = Math.round((ts.series?.deaths?.sum || 0) / tc);
          headshots = Math.round((ts.series?.headshots?.sum || 0) / tc);
          // Only set win/loss when tournament had exactly 1 series for this player
          if (tc === 1) win = (ts.series?.won?.find(w => w.value===true)?.count || 0) > 0;
        }

        return {
          kills, deaths, assists:0, headshots, win,
          maps:[{ kills, deaths, assists:0, headshots, map:'' }],
          _date: series.startTimeScheduled?.split('T')[0] || '',
          _opp:  opp,
        };
      });

      kvSet(cacheKey, games);
      return res.json({ games });
    }

    return res.status(400).json({ error:'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
