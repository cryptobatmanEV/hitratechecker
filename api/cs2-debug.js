export const config = { maxDuration: 30 };
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
async function stQ(q){
  const r=await fetch(STATS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});
  return r.json();
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const pid = '118726';
  const out = {};

  // Test different DateTimeFilter operators for startedAt
  for (const op of ['after','before','gt','lt','from','since','start','equals','greaterThan','gte','value']) {
    const r = await stQ(`{ playerStatistics(playerId:"${pid}",filter:{startedAt:{${op}:"2023-10-01T00:00:00Z"}}){ series{count} } }`);
    if (r?.errors) {
      const msg = r.errors[0]?.message || '';
      const notInFilter = msg.includes('not in') || msg.includes('WrongType');
      out[op] = notInFilter ? 'INVALID_FIELD' : msg.slice(0,80);
    } else {
      out[op] = { count: r?.data?.playerStatistics?.series?.count };
    }
  }

  return res.json({ pid, startedAt_operators: out });
}
