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

  // Find the totalstats table and get the raw kills cell for story
  const tableM = html.match(/<table[^>]*totalstats[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableM) return res.json({ error: 'no table' });

  // Find story's row in the table
  const storyRowStart = tableM[1].toLowerCase().indexOf('story');
  if (storyRowStart === -1) return res.json({ error: 'story not in table' });

  // Get surrounding row HTML (500 chars before and after name)
  const rowChunk = tableM[1].slice(Math.max(0, storyRowStart - 300), storyRowStart + 600);

  // Find all st-kills cells in the whole table
  const killsCells = (tableM[1].match(/<td class="st-kills[^"]*"[^>]*>([\s\S]*?)<\/td>/gi) || []).slice(0, 6);

  return res.json({
    story_row_chunk: rowChunk,
    kills_cells_sample: killsCells,
  });
}
