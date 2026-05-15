export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: Get Techno's series IDs
  const sd = await stQ(`{ playerStatistics(playerId:"118726",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds } }`);
  const ids = (sd?.data?.playerStatistics?.aggregationSeriesIds||[]).slice(0,6);
  out.sample_ids = ids;

  // Step 2: Get metadata for 6 series in ONE batch
  await sleep(1000);
  const fields = ids.map((id,i)=>`s${i}: series(id:"${id}"){ id startTimeScheduled tournament{id name} }`).join('\n');
  const md = await cdQ(`{ ${fields} }`);
  const series = Object.values(md?.data||{}).filter(Boolean);
  out.series_meta = series.map(s=>({id:s.id, date:s.startTimeScheduled?.split('T')[0], tourId:s.tournament?.id, tourName:s.tournament?.name}));

  // Step 3: Get unique tournament IDs and check for CHILDREN
  const tourIds = [...new Set(series.map(s=>s.tournament?.id).filter(Boolean))];
  out.unique_tour_ids = tourIds;

  await sleep(1000);
  // Query each tournament for parent + children
  const tourFields = tourIds.map((id,i)=>`t${i}: tournament(id:"${id}"){ id name parent{id name} children{id name} }`).join('\n');
  const tourD = await cdQ(`{ ${tourFields} }`);
  out.tournament_structure = Object.values(tourD?.data||{}).filter(Boolean);

  // Step 4: Query stats for each CHILD tournament to see if any have count=1
  const children = out.tournament_structure.flatMap(t=>t.children||[]).map(c=>c.id);
  out.child_ids = children;

  if(children.length) {
    await sleep(1500);
    const childStats = await stQ(`{
      ${children.slice(0,5).map((cid,i)=>`c${i}: playerStatistics(playerId:"118726",filter:{tournamentIds:{in:["${cid}"]}}){ series{count kills{sum avg}} }`).join('\n')}
    }`);
    out.child_stats = childStats?.data || childStats?.errors;
  }

  return res.json(out);
}
