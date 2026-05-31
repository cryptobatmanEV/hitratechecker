export const config = { maxDuration: 30 };
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const SP = `id name kills killAssistsGiven`;

async function cdQ(q) {
  const key = process.env.GRID_API_KEY;
  const r = await fetch(CD, { method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key},
    body: JSON.stringify({query:q}) });
  return r.json();
}
async function ssQ(q) {
  const key = process.env.GRID_API_KEY;
  const r = await fetch(SS, { method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key},
    body: JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Use CS2 player (title.id=28): stadodo → ID 117480, Rebels Gaming → teamId 53754
  const teamId = '53754';
  const slug = 'stadodo';

  // Step 1: series for Rebels Gaming last 6 months
  const ago = new Date(Date.now()-180*86400000).toISOString();
  const seriesResp = await cdQ(`{allSeries(filter:{teamIds:{in:["${teamId}"]},startTimeScheduled:{gte:"${ago}"}},first:10,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
  const ids = (seriesResp?.data?.allSeries?.edges||[]).map(e=>e.node?.id).filter(Boolean);
  out.series_count = ids.length;
  out.series_ids = ids;

  // Step 2: query seriesState for kills from Live Data Feed
  if (ids.length) {
    const batchQ = `{${ids.slice(0,5).map((id,i)=>`s${i}:seriesState(id:"${id}"){id startedAt teams{id name won players{${SP}}} games{sequenceNumber teams{id players{id name kills}}}}`).join(' ')}}`;
    const batch = await ssQ(batchQ);
    out.kills_data = Object.values(batch?.data||{}).slice(0,3).map(s => {
      if (!s) return null;
      for (const team of s.teams||[]) {
        const p = team.players?.find(p=>p.name?.toLowerCase().includes(slug));
        if (p) return { date:s.startedAt?.slice(0,10), player:p.name, kills:p.kills, team:team.name };
      }
      return { date:s.startedAt?.slice(0,10), teams: s.teams?.map(t=>t.name) };
    });
  }

  return res.json(out);
}
