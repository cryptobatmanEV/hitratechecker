export const config = { maxDuration: 30 };

const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const r = await fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['GET',key]) });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}
async function kvSet(key, val) {
  if (!KV_URL) return;
  try { await fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['SETEX',key,86400,JSON.stringify(val)]) }); } catch {}
}

async function gridFetch(url, query, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query}) });
    const d = await r.json();
    if (d?.errors?.[0]?.extensions?.errorType === 'UNAVAILABLE') {
      if (i < retries) { await sleep(3000); continue; }
    }
    return d;
  }
}

const cdQ    = q => gridFetch(CD, q);
const statsQ = q => gridFetch(STATS, q);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, playerId } = req.query;
  const nickname = req.query.nickname || req.query.q || '';

  try {
    // ── SEARCH ───────────────────────────────────────────────────────────────
    if (action === 'search') {
      const safe = nickname.replace(/"/g,'');
      let players = [];

      for (const f of [`equals: "${safe}"`, `contains: "${safe}"`]) {
        const d = await cdQ(`{ players(filter: { nickname: { ${f} } }, first: 10) { edges { node { id nickname title { id } team { id name } } } } }`);
        const all = d?.data?.players?.edges?.map(e => e.node) || [];
        if (!all.length) continue;

        const groups = {};
        for (const p of all) { const k = p.nickname.toLowerCase(); if (!groups[k]) groups[k] = []; groups[k].push(p); }

        for (const profiles of Object.values(groups)) {
          const csgo = profiles.find(p => p.title?.id === '1');
          const cs2  = profiles.find(p => p.title?.id === '28');
          const any  = profiles[0];
          const statsId  = csgo?.id || cs2?.id || any.id;
          const teamId   = cs2?.team?.id   || csgo?.team?.id   || any.team?.id;
          const teamName = cs2?.team?.name  || csgo?.team?.name  || any.team?.name || 'N/A';
          if (statsId) players.push({ id:`grid_${statsId}_${teamId||'0'}`, name:any.nickname, sub:`CS2 · ${teamName}` });
        }
        if (players.length) break;
      }
      return res.json({ players });
    }

    // ── GAMELOG ──────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts   = (playerId||'').split('_');
      const statsId = parts[1];
      const teamId  = parts[2];
      if (!statsId) return res.status(400).json({ error: 'Invalid ID' });

      // Cache check
      const today    = new Date().toISOString().split('T')[0];
      const cacheKey = `grid_${statsId}_${today}`;
      const cached   = await kvGet(cacheKey);
      if (cached) return res.json({ games: cached });

      // 1. Overall yearly stats + confirmed series IDs
      const overall = await statsQ(`{
        playerStatistics(playerId: "${statsId}", filter: { timeWindow: LAST_YEAR }) {
          aggregationSeriesIds
          series {
            count kills { sum } deaths { sum }
            won { value count }
            ... on CsgoPlayerSeriesStatistics { headshots { sum } }
          }
        }
      }`);

      const seriesIds = overall?.data?.playerStatistics?.aggregationSeriesIds || [];
      if (!seriesIds.length) return res.json({ games: [] });

      const s          = overall.data.playerStatistics.series;
      const totalCount = s.count || 1;
      const avgKills   = Math.round((s.kills?.sum  || 0) / totalCount);
      const avgDeaths  = Math.round((s.deaths?.sum || 0) / totalCount);
      const avgHS      = Math.round((s.headshots?.sum || 0) / totalCount);

      // 2. Series metadata (batched CD query)
      const fields = seriesIds.slice(0,25).map((id,i) =>
        `s${i}: series(id:"${id}") { id startTimeScheduled tournament { id } teams { baseInfo { id name } } }`
      ).join('\n');
      const metaD = await cdQ(`{ ${fields} }`);
      const meta  = Object.values(metaD?.data||{}).filter(Boolean);

      // 3. Per-tournament stats for top 3 tournaments only (keeps requests low)
      const tourIds = [...new Set(meta.map(s => s.tournament?.id).filter(Boolean))].slice(0,3);
      const tResults = await Promise.all(tourIds.map(tid => statsQ(`{
        playerStatistics(playerId: "${statsId}", filter: { tournamentIds: { in: ["${tid}"] } }) {
          aggregationSeriesIds
          series { count kills { sum } deaths { sum } won { value count }
            ... on CsgoPlayerSeriesStatistics { headshots { sum } }
          }
        }
      }`)));

      const tStats = {};
      tourIds.forEach((tid,i) => {
        const ts = tResults[i]?.data?.playerStatistics;
        if ((ts?.series?.count||0) > 0) tStats[tid] = ts;
      });

      // 4. Build game log
      const games = meta.map(series => {
        const opp = series.teams?.find(t => t.baseInfo?.id !== teamId)?.baseInfo?.name || '?';
        const ts  = tStats[series.tournament?.id];
        let kills = avgKills, deaths = avgDeaths, headshots = avgHS, win = null;
        if (ts) {
          const tc  = ts.series?.count || 1;
          kills     = Math.round((ts.series?.kills?.sum  || 0) / tc);
          deaths    = Math.round((ts.series?.deaths?.sum || 0) / tc);
          headshots = Math.round((ts.series?.headshots?.sum || 0) / tc);
          if (tc === 1) win = (ts.series?.won?.find(w => w.value===true)?.count||0) > 0;
        }
        return { kills, deaths, assists:0, headshots, win, maps:[],
          _date: series.startTimeScheduled?.split('T')[0]||'', _opp:opp, _matchUrl:null };
      }).sort((a,b) => new Date(b._date) - new Date(a._date));

      kvSet(cacheKey, games);
      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
