export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function q(query) {
  const r = await fetch(SS, {method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query})});
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Query Techno's series 2913007 (March 13 vs NaVi) with correct CS2 fields
  const r = await q(`{
    seriesState(id: "2913007") {
      id
      startedAt
      finished
      teams {
        id
        name
        won
        score
        players {
          id
          name
          kills
          deaths
          killAssistsGiven
          ... on SeriesPlayerStateCs2 { headshots }
          ... on SeriesPlayerStateCsgo { headshots }
        }
      }
      games {
        id
        sequenceNumber
        started
        finished
        map { name }
        teams {
          id
          name
          won
          players {
            id
            name
            kills
            deaths
            killAssistsGiven
            ... on GamePlayerStateCs2 { headshots }
            ... on GamePlayerStateCsgo { headshots }
          }
        }
      }
    }
  }`);

  return res.json(r?.data || r?.errors);
}
