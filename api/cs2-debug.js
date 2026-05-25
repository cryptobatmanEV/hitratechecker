export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function q(query) {
  const r = await fetch(SS, {method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query})});
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Introspect ALL types fully
  const schema = await q(`{ __schema { types {
    name
    fields { name type { name kind ofType { name kind ofType { name } } } }
  } } }`);
  const types = schema?.data?.__schema?.types || [];
  
  // Show SeriesPlayerState and nearby types
  for (const t of types) {
    if (!t.name || t.name.startsWith('__')) continue;
    if (t.fields?.length) {
      out['type_' + t.name] = t.fields.map(f => 
        `${f.name}: ${f.type?.name || f.type?.ofType?.name || f.type?.kind}`
      );
    }
  }

  // 2. Try seriesState without nickname - just id + stats fields
  const r2 = await q(`{
    seriesState(id:"2913007") {
      id
      teams {
        id
        players { id kills deaths assists headshots won }
      }
      games {
        id sequenceNumber
        teams {
          id
          players { id kills deaths assists headshots }
        }
      }
    }
  }`);
  out.seriesState = r2?.data || r2?.errors?.map(e=>e.message);

  return res.json(out);
}
