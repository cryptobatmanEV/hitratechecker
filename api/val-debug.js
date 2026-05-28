export const config = { maxDuration: 30 };

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,*/*',
};

function parsePlayerFromSearch(html) {
  // VLR search results: <a href="/player/123/aspas" class="search-item">
  const matches = [...html.matchAll(/href="\/player\/(\d+)\/([^"]+)"/g)];
  return matches.slice(0, 5).map(m => ({ id: m[1], slug: m[2] }));
}

function parseMatchLinks(html) {
  // Match links look like: href="/12345/team-a-vs-team-b/..."
  const matches = [...html.matchAll(/href="\/(\d{5,}\/[^"]+)"/g)];
  return [...new Set(matches.map(m => m[1]))].slice(0, 5);
}

function parseMatchStats(html, playerSlug) {
  // Look for player row in match page
  const hasStats = html.toLowerCase().includes('kill');
  const hasAcs   = html.toLowerCase().includes('acs');
  const hasPlayer = html.toLowerCase().includes(playerSlug.toLowerCase());

  // Try to find stat rows
  const tableIdx = html.indexOf('mod-player');
  const sample = tableIdx > -1 ? html.slice(tableIdx, tableIdx + 800) : 'mod-player not found';
  return { hasStats, hasAcs, hasPlayer, sample };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Step 1: Parse search HTML to get aspas's real player ID
  const searchR = await fetch('https://www.vlr.gg/search/?q=aspas&type=players', { headers: H });
  const searchHtml = await searchR.text();
  const players = parsePlayerFromSearch(searchHtml);
  out.step1_search_players = players;

  if (!players.length) {
    return res.json({ ...out, error: 'No players found in search HTML' });
  }

  const { id, slug } = players[0];
  out.found_player = { id, slug };

  // Step 2: Fetch player matches page with correct ID
  const matchesR = await fetch(`https://www.vlr.gg/player/matches/${id}`, { headers: H });
  const matchesHtml = await matchesR.text();
  const matchLinks = parseMatchLinks(matchesHtml);
  out.step2_match_links = {
    page_size: matchesHtml.length,
    links_found: matchLinks,
    has_any_match_links: matchLinks.length > 0,
  };

  // Step 3: If we got match links, fetch the first match page and check for stats
  if (matchLinks.length > 0) {
    const matchR = await fetch(`https://www.vlr.gg/${matchLinks[0]}`, { headers: H });
    const matchHtml = await matchR.text();
    out.step3_match_page = {
      url: matchLinks[0],
      page_size: matchHtml.length,
      ...parseMatchStats(matchHtml, slug),
    };
  }

  return res.json(out);
}
