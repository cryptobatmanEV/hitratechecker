export const config = { maxDuration: 30 };
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function stQ(q){const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Step 1: Get ALL unique tournament IDs from Techno's 50 series
  const sd = await stQ(`{ playerStatistics(playerId:"118726",filter:{timeWindow:LAST_YEAR}){ aggregationSeriesIds } }`);
  const ids = sd?.data?.playerStatistics?.aggregationSeriesIds || [];

  // Get metadata for ALL 50 series in 4 parallel batches
  const batches = [];
  for(let i=0;i<ids.length;i+=15) batches.push(ids.slice(i,i+15));
  const batchResults = await Promise.all(batches.map(async (chunk,bi) => {
    const fields = chunk.map((id,j)=>`s${bi*15+j}: series(id:"${id}"){ id tournament{id name} startTimeScheduled }`).join('\n');
    const md = await cdQ(`{ ${fields} }`);
    return Object.values(md?.data||{}).filter(Boolean);
  }));
  const allMeta = batchResults.flat();

  // Get all unique tournament IDs
  const tourMap = {};
  allMeta.forEach(s => { if(s.tournament?.id) tourMap[s.tournament.id] = s.tournament.name; });
  out.all_tournaments = tourMap;

  // Step 2: Query playerStatistics for EVERY unique tournament — find count=1 ones
  const tourIds = Object.keys(tourMap);
  const tourStats = await Promise.allSettled(tourIds.map(tid =>
    stQ(`{ playerStatistics(playerId:"118726",filter:{tournamentIds:{in:["${tid}"]}}){ aggregationSeriesIds series{count kills{sum avg}} } }`)
  ));

  out.per_tournament_counts = {};
  tourIds.forEach((tid,i) => {
    const r = tourStats[i];
    if(r.status==='fulfilled') {
      const ps = r.value?.data?.playerStatistics;
      out.per_tournament_counts[tid] = {
        name: tourMap[tid],
        count: ps?.series?.count || 0,
        killsSum: ps?.series?.kills?.sum || 0,
        killsAvg: ps?.series?.kills?.avg || 0,
        exact: (ps?.series?.count||0) === 1
      };
    }
  });

  // Step 3: Check if a tournament has children in CD (using BLAST Rotterdam parent)
  const blastTourId = Object.keys(tourMap).find(id => tourMap[id]?.toLowerCase().includes('blast') || tourMap[id]?.toLowerCase().includes('rotterdam'));
  if(blastTourId) {
    const r = await cdQ(`{ tournament(id:"${blastTourId}") { id name parent{id name} children{id name} } }`);
    out.blast_tournament_detail = r?.data?.tournament || r?.errors;
  }

  return res.json(out);
}
