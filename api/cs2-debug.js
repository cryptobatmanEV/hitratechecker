export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const r = await ssQ(`{
    seriesState(id:"2944380"){
      teams{id name players{id name kills deaths ...on SeriesPlayerStateCs2{headshots}}}
    }
  }`);
  // Show ALL M80 player names and stats
  const m80 = r?.data?.seriesState?.teams?.find(t=>t.id==='52200');
  return res.json({
    m80_all_players: m80?.players?.map(p=>({name:p.name, kills:p.kills, hs:p.headshots})) || []
  });
}
