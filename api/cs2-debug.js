export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;

async function cdQ(q) {
  const r = await fetch(CD, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) });
  return r.json();
}
async function stQ(q) {
  const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: overall stats for device
  const sd = await stQ(`{ playerStatistics(playerId:"3455",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds series{ count kills{sum} deaths{sum} ... on CsgoPlayerSeriesStatistics{ headshots{sum} } } } }`);
  const ps  = sd?.data?.playerStatistics;
  const ids = ps?.aggregationSeriesIds || [];
  const tot = ps?.series?.count || 1;
  out.step1 = { count: tot, killsSum: ps?.series?.kills?.sum, avgK: Math.round((ps?.series?.kills?.sum||0)/tot), ids: ids.slice(0,3) };

  // Step 2: metadata for first 5 series
  const slice = ids.slice(0,5);
  const fields = slice.map((id,i) => `s${i}: series(id:"${id}") { id startTimeScheduled tournament{id} teams{baseInfo{id name}} }`).join('\n');
  const md = await cdQ(`{ ${fields} }`);
  const meta = Object.values(md?.data||{}).filter(Boolean);
  out.step2 = { metaCount: meta.length, first: meta[0] };

  // Step 3: tournament stats
  const tourIds = [...new Set(meta.map(s=>s.tournament?.id).filter(Boolean))].slice(0,3);
  const tResults = await Promise.allSettled(tourIds.map(tid => stQ(`{ playerStatistics(playerId:"3455",filter:{tournamentIds:{in:["${tid}"]}}){ series{ count kills{sum} deaths{sum} ... on CsgoPlayerSeriesStatistics{headshots{sum}} } } }`)));
  const tStats = {};
  tourIds.forEach((tid,i) => {
    const r = tResults[i];
    const ts = r.status==='fulfilled' ? r.value?.data?.playerStatistics : null;
    tStats[tid] = { count: ts?.series?.count, killsSum: ts?.series?.kills?.sum, hs: ts?.series?.headshots?.sum, error: r.value?.errors?.[0]?.message };
  });
  out.step3 = tStats;

  // Step 4: what a game object looks like
  const avgK = Math.round((ps?.series?.kills?.sum||0)/tot);
  const avgD = Math.round((ps?.series?.deaths?.sum||0)/tot);
  const avgHS = Math.round((ps?.series?.headshots?.sum||0)/tot);
  const sampleSeries = meta[0];
  const tid = sampleSeries?.tournament?.id;
  const ts = tStats[tid];
  out.step4_sampleGame = {
    kills: avgK, deaths: avgD, headshots: avgHS,
    tournamentFound: !!ts?.count,
    finalKills: ts?.count ? Math.round((ts.killsSum||0)/ts.count) : avgK
  };

  return res.json(out);
}
