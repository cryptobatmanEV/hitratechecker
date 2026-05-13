export const config = { maxDuration: 10 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Fetch the match stats page for story's recent game
  const url = 'https://www.hltv.org/stats/matches/mapstatsid/228816/5star-vs-flyquest?contextIds=20462&contextTypes=player';
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  const html = await r.text();

  // Find headshot patterns - look for (hs) or headshot mentions near player name
  const hsPattern = html.match(/story[\s\S]{0,500}/i)?.[0]?.slice(0, 500);
  
  // Find all patterns like "X (Y)" which is the kills (hs) format
  const kdHsMatches = [];
  const rx = /(\d+)\s*\((\d+)\)/g;
  let m;
  while ((m = rx.exec(html)) !== null) {
    kdHsMatches.push({ kills: m[1], hs: m[2] });
    if (kdHsMatches.length >= 10) break;
  }

  // Look for the player row containing story's data
  const storyIdx = html.toLowerCase().indexOf('story');
  const storyContext = storyIdx > -1 ? html.slice(storyIdx - 100, storyIdx + 600) : 'not found';

  return res.json({
    status: r.status,
    html_length: html.length,
    kd_hs_patterns: kdHsMatches,
    story_context: storyContext.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
  });
}
