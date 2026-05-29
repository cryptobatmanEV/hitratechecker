export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const get = async (url) => {
    const r = await fetch(url.replace('http://','https://'), { headers:{'User-Agent':UA} });
    if (!r.ok) throw new Error(`ESPN ${r.status}`);
    return r.json();
  };

  // Get competition for game 401856893 (confirmed working)
  const comp = await get('https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/events/401856893/competitions/401856893');
  
  // Show FULL competitor objects so we know exactly what fields are inline vs $ref
  const competitors = comp.competitors || [];
  
  return res.json({
    date: comp.date,
    competitor_0: {
      id: competitors[0]?.id,
      homeAway: competitors[0]?.homeAway,
      winner: competitors[0]?.winner,         // is winner inline?
      score_type: typeof competitors[0]?.score,
      score_value: competitors[0]?.score,      // inline or $ref?
      team_type: typeof competitors[0]?.team,
      team_value: competitors[0]?.team,        // inline or $ref?
    },
    competitor_1: {
      id: competitors[1]?.id,
      homeAway: competitors[1]?.homeAway,
      winner: competitors[1]?.winner,
      score_type: typeof competitors[1]?.score,
      score_value: competitors[1]?.score,
      team_type: typeof competitors[1]?.team,
      team_value: competitors[1]?.team,
    },
  });
}
