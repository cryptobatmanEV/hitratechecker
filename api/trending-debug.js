export const config = { maxDuration: 30 };
const UA = 'Mozilla/5.0';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='lol' } = req.query;
  const host = req.headers.host;

  if (sport === 'lol') {
    // Verify the missing player ID fix works
    const r = await fetch('https://api.prizepicks.com/projections?league_id=121&per_page=250',
      {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
    const d = await r.json();
    const pMap = {};
    for (const i of d.included||[]) {
      if (i.type==='new_player') pMap[i.id]={name:i.attributes?.display_name||i.attributes?.name,team:i.attributes?.team};
    }
    const projs = (d.data||[]).filter(p=>p.type==='projection');
    const missingIds = [...new Set(projs.map(p=>p.relationships?.new_player?.data?.id).filter(id=>id&&!pMap[id]))];
    // Fetch one missing player to verify endpoint works
    let fetchedPlayer = null;
    if (missingIds[0]) {
      const pr = await fetch(`https://api.prizepicks.com/new_players/${missingIds[0]}`,
        {headers:{Accept:'application/json','User-Agent':UA,'Referer':'https://app.prizepicks.com/'}});
      const pd = await pr.json();
      fetchedPlayer = { id:missingIds[0], status:pr.status, data:pd.data?.attributes ? {name:pd.data.attributes.display_name||pd.data.attributes.name, team:pd.data.attributes.team} : pd };
    }
    return res.json({
      sport:'lol',
      pmap_from_included: Object.keys(pMap).length,
      missing_ids_count: missingIds.length,
      first_missing_id: missingIds[0],
      fetched_player: fetchedPlayer,
    });
  }

  if (sport === 'dota') {
    // Verify proPlayers is fast and has the right player names
    const t = Date.now();
    const r = await fetch('https://api.opendota.com/api/proPlayers');
    const pros = await r.json();
    const ms = Date.now()-t;
    const norm = s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    // Test match for known PP players
    const testNames = ['skiter','Yatoro','Pure','Larl','Nisha'];
    const matches = testNames.map(name=>{
      const n = norm(name);
      const m = pros.find(p=>norm(p.name||'')===n) || pros.find(p=>norm(p.name||'').includes(n));
      return {name, found:!!m, account_id:m?.account_id, pro_name:m?.name};
    });
    return res.json({sport:'dota', proPlayers_ms:ms, total_pros:pros.length, test_matches:matches});
  }
}
