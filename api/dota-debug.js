export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  const accountId = req.query.id || '321580662'; // default to Yatoro

  // Exactly what dota.js does
  const r = await fetch(`https://api.opendota.com/api/players/${accountId}/matches?limit=5&significant=1`);
  const raw = await r.json();

  const parsed = Array.isArray(raw) ? raw
    .filter(m => typeof m.kills === 'number')
    .map(m => ({
      kills:    m.kills,
      deaths:   m.deaths   ?? 0,
      assists:  m.assists  ?? 0,
      gpm:      m.gold_per_min ?? 0,
      xpm:      m.xp_per_min  ?? 0,
      _date:    new Date((m.start_time||0)*1000).toISOString().split('T')[0],
      _opp:     '',
      win:      m.radiant_win === (m.player_slot < 128),
    })) : [];

  return res.json({
    raw_count: Array.isArray(raw) ? raw.length : 'not array',
    raw_sample: Array.isArray(raw) ? raw[0] : raw,
    raw_sample_kill_type: Array.isArray(raw) ? typeof raw[0]?.kills : 'n/a',
    parsed_count: parsed.length,
    parsed_sample: parsed[0],
    kills_value: parsed[0]?.kills,
    kills_typeof: typeof parsed[0]?.kills,
  });
}
