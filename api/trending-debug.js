export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';
const PP_HDRS = {Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const host = req.headers.host;
  const out = {};

  // Step 1: get a missing player ID from LoL
  const r = await fetch('https://api.prizepicks.com/projections?league_id=121&per_page=250', {headers:PP_HDRS});
  const d = await r.json();
  const pMap = {};
  for (const i of d.included||[]) {
    if (i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name,combo:i.attributes?.combo===true};
  }
  const projs = (d.data||[]).filter(p=>p.type==='projection');
  const missingIds = [...new Set(projs.map(p=>p.relationships?.new_player?.data?.id).filter(id=>id&&!pMap[id]))];
  out.pmap_size = Object.keys(pMap).length;
  out.missing_count = missingIds.length;
  out.missing_sample = missingIds.slice(0,3);

  // Step 2: test the new_players endpoint for a missing ID
  if (missingIds[0]) {
    const tid = missingIds[0];
    const pr = await fetch(`https://api.prizepicks.com/new_players/${tid}`, {headers:PP_HDRS});
    const pd = await pr.json().catch(e=>({error:e.message}));
    out.new_players_endpoint = {
      id: tid,
      status: pr.status,
      ok: pr.ok,
      response_keys: Object.keys(pd),
      data_type: pd.data?.type,
      attrs: pd.data?.attributes ? {name:pd.data.attributes.display_name||pd.data.attributes.name, combo:pd.data.attributes.combo} : null,
      errors: pd.errors?.slice(0,2),
    };
  }

  // Step 3: check the pMap entries we DO have — are any combo:false?
  const pMapValues = Object.values(pMap);
  out.pmap_combo_false = pMapValues.filter(p=>!p.combo).length;
  out.pmap_combo_true = pMapValues.filter(p=>p.combo).length;
  out.pmap_sample_noncombo = pMapValues.filter(p=>!p.combo).slice(0,3).map(p=>p.name);

  // Step 4: check how many projs have a player in pMap and are non-combo
  let matched=0, nameOk=0, notCombo=0, resolvOk=0;
  for (const p of projs) {
    const pid = p.relationships?.new_player?.data?.id;
    const pl = pMap[pid]||{};
    if (pl.name) nameOk++;
    if (pl.name && p.attributes?.event_type!=='combo') notCombo++;
    // rough check
    matched++;
  }
  out.filter_check = {total:projs.length, has_name:nameOk, name_and_not_combo:notCombo};

  return res.json(out);
}
