export const config = { maxDuration: 30 };

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Step 1: Search orlando API for "aspas"
  try {
    const r = await fetch('https://vlr.orlandomm.net/api/v1/players?limit=100&page=1');
    const d = await r.json();
    const players = d?.data || [];
    const match = players.filter(p =>
      (p.name || '').toLowerCase().includes('aspas') ||
      (p.name || '').toLowerCase().includes('zekken') ||
      (p.name || '').toLowerCase().includes('nats') ||
      (p.name || '').toLowerCase().includes('derke')
    );
    out.orlando_search = { total: d?.pagination?.totalElements, matched: match };
  } catch (e) {
    out.orlando_search = { error: e.message };
  }

  // Step 2: Fetch aspas's actual VLR.gg player page (known ID = 1093)
  // aspas is a well-known active VCT player
  try {
    const r = await fetch('https://www.vlr.gg/player/1093/aspas', { headers: HEADERS });
    const html = await r.text();
    out.aspas_page = {
      status: r.status,
      content_length: html.length,
      has_wf_table: html.includes('wf-table'),
      has_mod_stat: html.includes('mod-stat'),
      has_kills: html.includes('kills') || html.includes('Kills'),
      has_acs: html.includes('ACS') || html.includes('acs'),
      has_match_history: html.includes('match-item') || html.includes('player-result'),
      // Show a slice around the stats area
      stats_area_sample: (() => {
        const idx = html.indexOf('mod-stat');
        return idx > -1 ? html.slice(Math.max(0, idx - 100), idx + 500) : 'mod-stat not found';
      })(),
      match_table_sample: (() => {
        const idx = html.indexOf('wf-table');
        return idx > -1 ? html.slice(Math.max(0, idx - 100), idx + 500) : 'wf-table not found';
      })(),
    };
  } catch (e) {
    out.aspas_page = { error: e.message };
  }

  return res.json(out);
}
