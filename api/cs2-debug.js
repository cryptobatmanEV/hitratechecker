export const config = { maxDuration: 10 };
const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = 'https://www.hltv.org/stats/matches/mapstatsid/228816/5star-vs-flyquest';
  const r = await fetch(
    `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`,
    { headers: { Accept: 'text/html' } }
  );
  const html = await r.text();

  // Find all st- prefixed classes
  const stClasses = [...new Set((html.match(/class="st-[^"]+"/gi) || []))].slice(0, 20);

  // Find headshot context  
  const hsIdx = html.toLowerCase().indexOf('headshot');
  const hsContext = html.slice(Math.max(0, hsIdx - 200), hsIdx + 400).replace(/\s+/g, ' ');

  // Get story's full row raw HTML from the totalstats table
  const tableM = html.match(/<table[^>]*totalstats[^>]*>([\s\S]*?)<\/table>/i);
  const storyRowM = tableM?.[1].match(/story[\s\S]{0,600}/i);
  const storyRaw = storyRowM?.[0].slice(0, 600);

  return res.json({ st_classes: stClasses, headshot_context: hsContext, story_raw: storyRaw });
}
