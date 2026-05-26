export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
const CD = 'https://api-op.grid.gg/central-data/graphql';
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Fix: latestSeriesStateByPlayerId with id argument
  const r1 = await ssQ(`{ latestSeriesStateByPlayerId(id:"116103") {
    id startedAt
    teams { id name players {
      id name kills
      ... on SeriesPlayerStateCs2 { headshots }
    }}
  }}`);
  out.latestByPlayerId = r1?.data?.latestSeriesStateByPlayerId || r1?.errors?.[0]?.message;

  // 2. Batch the 5 most recent Cybershoke series and show ALL players (find glowiing)
  const seriesIds = ["2949205","2943341","2935826"];
  const batch = await ssQ(`{
    ${seriesIds.map((id,i) => `s${i}: seriesState(id:"${id}") {
      id startedAt
      teams { id name players { id name kills } }
    }`).join('\n')}
  }`);
  // Show all player names in these series
  out.recentRosters = Object.values(batch?.data||{}).map(s => ({
    date: s?.startedAt?.split('T')[0],
    teams: s?.teams?.map(t => ({
      name: t.name,
      players: t.players?.map(p => p.name)
    }))
  }));

  // 3. Check if GRID CD has externalLinks on glowiing's profile (Steam ID)
  const r3 = await cdQ(`{ player(id:"116103") {
    id nickname
    externalLinks { dataProvider { name } externalEntity { id } }
  }}`);
  out.glowiingExternalLinks = r3?.data?.player || r3?.errors;

  return res.json(out);
}
