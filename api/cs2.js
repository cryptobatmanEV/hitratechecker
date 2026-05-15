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

// Distribute tournament stats across individual series using min/max/sum
// When count=1: exact. When count=2: [min, sum-min]. When count>2: [min, avg..., max]
function distributeStats(series, ts) {
  const tc = ts?.series?.count || 0;
  if (!tc || !series.length) return;

  const kSum = ts.series.kills?.sum  || 0;
  const kMin = ts.series.kills?.min  || 0;
  const kMax = ts.series.kills?.max  || 0;
  const dSum = ts.series.deaths?.sum || 0;
  const dMin = ts.series.deaths?.min || 0;
  const dMax = ts.series.deaths?.max || 0;
  const hSum = ts.series.headshots?.sum || 0;
  const hMin = ts.series.headshots?.min || 0;
  const hMax = ts.series.headshots?.max || 0;

  // Sort series oldest→newest within tournament for distribution
  const sorted = [...series].sort((a,b) => new Date(a._date) - new Date(b._date));
  const n = sorted.length;

  if (tc === 1 || n === 1) {
    // Exact stats for single series
    sorted.forEach(s => { s._k = kSum; s._d = dSum; s._hs = hSum; s._win = (ts.series?.won?.find(w=>w.value===true)?.count||0) > 0; });
  } else if (n === 2) {
    sorted[0]._k = kMin; sorted[0]._d = dMin; sorted[0]._hs = hMin;
    sorted[1]._k = kSum - kMin; sorted[1]._d = dSum - dMin; sorted[1]._hs = hSum - hMin;
  } else {
    // First=min, last=max, middle=distribute remainder
    sorted[0]._k = kMin; sorted[0]._d = dMin; sorted[0]._hs = hMin;
    sorted[n-1]._k = kMax; sorted[n-1]._d = dMax; sorted[n-1]._hs = hMax;
    const midK  = Math.round((kSum - kMin - kMax) / Math.max(n-2, 1));
    const midD  = Math.round((dSum - dMin - dMax) / Math.max(n-2, 1));
    const midHS = Math.round((hSum - hMin - hMax) / Math.max(n-2, 1));
    for (let i=1; i<n-1; i++) { sorted[i]._k = midK; sorted[i]._d = midD; sorted[i]._hs = midHS; }
  }
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
        const all = d?.data?.players?.edges?.map(e=>e.node) || [];
        if (!all.length) continue;
        const groups = {};
        for (const p of all) { const k=p.nickname.toLowerCase(); if(!groups[k])groups[k]=[]; groups[k].push(p); }
        const players = [];
        for (const profiles of Object.values(groups)) {
          const csgo = profiles.find(p=>p.title?.id==='1');
          const cs2  = profiles.find(p=>p.title?.id==='28');
          const any  = profiles[0];
          const statsId  = csgo?.id || cs2?.id || any.id;
          const teamId   = cs2?.team?.id   || csgo?.team?.id   || any.team?.id;
          const teamName = cs2?.team?.name  || csgo?.team?.name  || any.team?.name || 'N/A';
          if (statsId) players.push({ id:`grid_${statsId}_${teamId||'0'}`, name:any.nickname, sub:`CS2 · ${teamName}` });
        }
        if (players.length) return res.json({ players });
      }
      return res.json({ players:[] });
    }

    // ── GAMELOG ───────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts   = (playerId||'').split('_');
      const statsId = parts[1];
      const teamId  = parts[2];
      if (!statsId) return res.status(400).json({ error:'Invalid ID' });

      const today    = new Date().toISOString().split('T')[0];
      const cacheKey = `grid_v4_${statsId}_${today}`;
      const cached   = await kvGet(cacheKey);
      if (cached) return res.json({ games:cached });

      // Step 1: overall LAST_YEAR stats + all series IDs
      const sd = await stQ(`{
        playerStatistics(playerId:"${statsId}", filter:{timeWindow:LAST_YEAR}) {
          aggregationSeriesIds
          series {
            count kills{sum avg min max} deaths{sum avg min max} won{value count}
            ...on CsgoPlayerSeriesStatistics { headshots{sum avg min max} }
            ...on Cs2PlayerSeriesStatistics  { headshots{sum avg min max} }
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

      // Step 2: all series metadata in parallel batches → sort by date → take 30 most recent
      const batches = [];
      for (let i=0; i<ids.length; i+=15) batches.push(ids.slice(i,i+15));
      const batchResults = await Promise.all(batches.map(async (chunk,bi) => {
        const fields = chunk.map((id,j) =>
          `s${bi*15+j}: series(id:"${id}") { id startTimeScheduled tournament{id} teams{baseInfo{id name}} }`
        ).join('\n');
        const md = await cdQ(`{ ${fields} }`);
        return Object.values(md?.data||{}).filter(Boolean);
      }));
      const allMeta = batchResults.flat()
        .filter(s => s.startTimeScheduled)
        .sort((a,b) => new Date(b.startTimeScheduled) - new Date(a.startTimeScheduled))
        .slice(0, 30);

      // Step 3: per-tournament stats with min/max/sum — ALL IN PARALLEL
      const tourIds = [...new Set(allMeta.map(s=>s.tournament?.id).filter(Boolean))].slice(0,10);
      const tourResults = await Promise.allSettled(tourIds.map(tid =>
        stQ(`{
          playerStatistics(playerId:"${statsId}", filter:{tournamentIds:{in:["${tid}"]}}) {
            aggregationSeriesIds
            series {
              count kills{sum avg min max} deaths{sum avg min max} won{value count}
              ...on CsgoPlayerSeriesStatistics { headshots{sum avg min max} }
              ...on Cs2PlayerSeriesStatistics  { headshots{sum avg min max} }
            }
          }
        }`)
      ));
      const tStats = {};
      tourIds.forEach((tid,i) => {
        const r = tourResults[i];
        if (r.status==='fulfilled') {
          const ts = r.value?.data?.playerStatistics;
          if ((ts?.series?.count||0) > 0) tStats[tid] = ts;
        }
      });

      // Step 4: build series objects, group by tournament, distribute stats
      const seriesObjs = allMeta.map(series => {
        const opp = series.teams?.find(t=>t.baseInfo?.id!==teamId)?.baseInfo?.name || '?';
        return {
          _date: series.startTimeScheduled?.split('T')[0] || '',
          _opp: opp,
          _tourId: series.tournament?.id,
          _k: avgK, _d: avgD, _hs: avgHS, _win: null,
        };
      });

      // Group by tournament and distribute min/max/sum across series in that tournament
      const byTour = {};
      seriesObjs.forEach(s => { if(!byTour[s._tourId])byTour[s._tourId]=[]; byTour[s._tourId].push(s); });
      for (const [tid, group] of Object.entries(byTour)) {
        const ts = tStats[tid];
        if (ts) distributeStats(group, ts);
      }

      // Step 5: build final game objects
      const games = seriesObjs.map(s => ({
        kills:     Math.max(0, s._k),
        deaths:    Math.max(0, s._d),
        assists:   0,
        headshots: Math.max(0, s._hs),
        win:       s._win,
        maps:      [{ kills: Math.max(0,s._k), deaths: Math.max(0,s._d), assists:0, headshots: Math.max(0,s._hs), map:'' }],
        _date:     s._date,
        _opp:      s._opp,
      })).sort((a,b) => new Date(b._date) - new Date(a._date));

      kvSet(cacheKey, games);
      return res.json({ games });
    }

    return res.status(400).json({ error:'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error:e.message });
  }
}
