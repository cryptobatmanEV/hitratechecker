export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // Yatoro's OpenDota account ID (Team Spirit)
  const accountId = '321580662';

  // Test 1: with significant=1
  const r1 = await fetch(`https://api.opendota.com/api/players/${accountId}/matches?limit=5&significant=1`);
  const d1 = await r1.json();
  out.significant_1 = { status: r1.status, count: Array.isArray(d1)?d1.length:'not array', sample: Array.isArray(d1)?d1[0]:d1 };

  // Test 2: no filter at all
  const r2 = await fetch(`https://api.opendota.com/api/players/${accountId}/matches?limit=5`);
  const d2 = await r2.json();
  out.no_filter = { status: r2.status, count: Array.isArray(d2)?d2.length:'not array', sample: Array.isArray(d2)?d2[0]:d2 };

  // Test 3: lobby_type=2 (tournament)
  const r3 = await fetch(`https://api.opendota.com/api/players/${accountId}/matches?limit=5&lobby_type=2`);
  const d3 = await r3.json();
  out.lobby_type_2 = { status: r3.status, count: Array.isArray(d3)?d3.length:'not array', sample: Array.isArray(d3)?d3[0]:d3 };

  // Test 4: check player profile (is it public?)
  const r4 = await fetch(`https://api.opendota.com/api/players/${accountId}`);
  const d4 = await r4.json();
  out.profile = { profile_public: !d4.profile?.private, name: d4.profile?.personaname, tracked: d4.profile?.last_match_time };

  return res.json(out);
}
