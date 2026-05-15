Subject: Open Platform API — Tournament Coverage Gaps & Per-Series Statistics Question

Hi GRID team,

I'm building a CS2 player performance research tool using the Open Platform API and have run into two issues I'm hoping you can help with.

**1. Tournament Coverage Gaps**

After extensive testing I've found that our Open Platform access appears to cover ESL and IEM events well, but several major 2026 tournaments are missing entirely from both the Central Data and Statistics Feed APIs:

- PGL Bucharest 2026 (April 4–11, 2026)
- PGL Astana 2026 (May 9–13, 2026)
- BLAST Open Rotterdam 2026 (March 2026)

Searching for these by name returns no results in the `tournaments` query. Is PGL and BLAST data available on the Open Platform, or is this restricted to a higher access tier? If so, what would it take to get access?

**2. Per-Series Individual Statistics**

I've thoroughly explored the Statistics Feed schema via introspection and found that `playerStatistics` only returns aggregate stats (sum/avg/min/max) across a tournament or time window — not individual stats per series. I tested `seriesStatistics`, `gameStatistics`, `teamGameStatistics`, and all segment/game sub-fields but could not find a way to retrieve kills/deaths/headshots for a specific individual series.

Is there an endpoint or query pattern that returns per-series (individual match) player statistics? This is critical for our use case — we need to know that a player had 24 kills in Series A and 38 kills in Series B, not just that they averaged 31 across the tournament.

**Our Use Case**

We run a CS2 DFS (daily fantasy sports) research community and are building a hit-rate tracker that shows how often players exceed statistical lines. Accurate per-game data and full tournament coverage are essential for this to be useful.

We're happy to move to a higher access tier if that's what's needed. Could you let us know:
1. Whether PGL/BLAST tournament data is available and how to access it
2. Whether per-series individual player stats exist anywhere in the API
3. Whether Closed Platform access would resolve either or both of these gaps

Thank you for the great platform — looking forward to hearing from you.

Best,
CryptoBatman
The +EV Cave
