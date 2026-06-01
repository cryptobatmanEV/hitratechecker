export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const { sport='lol' } = req.query;
  const host = req.headers.host;

  if (sport === 'lol') {
    // Test actual trending with scope=map4 (current PP props are MAP 4 Kills)
    const r = await fetch(`https://${host}/api/trending?sport=lol&scope=map4`);
    const d = await r.json();
    return res.json({
      sport: 'lol',
      scope_tested: 'map4',
      debug: d.debug,
      result_count: (d.results||[]).length,
      first_result: d.results?.[0],
      note: (d.results||[]).length === 0
        ? 'No results — PP has MAP 4 props but players may have too few 4-map series historically'
        : 'Results found!'
    });
  }

  if (sport === 'dota') {
    const r = await fetch(`https://${host}/api/trending?sport=dota`);
    const d = await r.json();
    return res.json({ sport:'dota', debug:d.debug, result_count:(d.results||[]).length, results:d.results?.slice(0,3) });
  }
}
