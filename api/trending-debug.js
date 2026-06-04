export const config = { maxDuration: 15 };
const KEY = '16671c2193msh3dc96da6f4fdb02p1b2b4bjsn5ce9c99fdb44';
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const H = {'x-rapidapi-key':KEY,'x-rapidapi-host':HOST};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    // Test 1: past-matches for Alcaraz (id from docs: 104925)
    const r1 = await fetch(`https://${HOST}/tennis/v2/atp/player/past-matches/104925`,{headers:H,signal:AbortSignal.timeout(10000)});
    const t1 = await r1.text();

    // Test 2: how many ranked singles ATP players exist (to plan cache pages)
    const r2 = await fetch(`https://${HOST}/tennis/v2/atp/player?pageSize=200&pageNo=1&filter=PlayerGroup:singles`,{headers:H,signal:AbortSignal.timeout(10000)});
    const t2 = await r2.text();
    const d2 = JSON.parse(t2);
    const ranked = (Array.isArray(d2) ? d2 : d2?.data||[]).filter(p=>p.currentRank);

    return res.json({
      past_matches_status: r1.status,
      past_matches_preview: t1.slice(0,800),
      atp_page1_total: (Array.isArray(d2)?d2:d2?.data||[]).length,
      atp_ranked_count: ranked.length,
      atp_ranked_sample: ranked.slice(0,3).map(p=>({id:p.id,name:p.name,rank:p.currentRank}))
    });
  } catch(e) {
    return res.json({error:e.message});
  }
}
