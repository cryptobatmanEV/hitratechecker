# PropScope architecture

## Runtime shape

PropScope is a single-page React 18 application in `index.html`. React and Babel are loaded from CDNs and the JSX, CSS, state, API helpers, calculators, and rendered views all live in that file. Vercel serves the static page and treats each file in `api/` as a serverless function.

## Frontend components and state

- `App` owns the complete application state. The primary modes are `check` for player research and `trending` for PrizePicks research.
- `SearchBox` provides debounced player search and selection for the active sport.
- `RateCard`, `SB`, `TrendColor`, and the inline result sections render hit rates, summary statistics, trend labels, game logs, splits, and MLB matchup data.
- Sport-specific selectors are driven by the `HIT_STATS`, `PIT_STATS`, `NBA_STATS`, `WNBA_STATS`, `NFL_STATS`, `CFB_STATS`, `NHL_STATS`, `TENNIS_STATS`, and `ES_STATS` configuration arrays.
- `App` derives L5, L10, L30, season, career, head-to-head, home, away, streak, trend, and matchup values from the loaded game logs. The hit-rate rule remains strict: an over clears when `value > line`, and an under clears when `value < line`.

Important state groups:

- Player research: sport, player, stat index, line, over or under, game log, career log, loading, error, and split or matchup results.
- MLB context: hitting or pitching group, today's games, selected game, opposing team, opposing pitcher, and pitcher information.
- Esports context: game selection, map scope, and tennis best-of setting.
- Trending: selected PrizePicks sport and scope, loading, error, retry counter, results, and the API diagnostic object.

## Data flow

1. A user selects a sport, searches for a player, selects a stat, enters a line, and chooses over or under.
2. The frontend calls the matching serverless route, usually with `action=search` or `action=gamelog`.
3. The route fetches the upstream provider, normalizes game records, and returns JSON. The frontend calculates display metrics locally.
4. In Trending mode, `App` calls `/api/trending?sport=...&scope=...`. The route fetches PrizePicks projections, resolves players through sport-specific providers, loads game logs, calculates directional hit rates, sorts by L10 percentage, and returns `results` plus `debug` diagnostics.
5. Trending requests use an `AbortController`; changing sport or scope cancels the prior request so stale results cannot replace the current view.

## Serverless routes

- `api/nba.js`, `api/wnba.js`, `api/nfl.js`, and `api/cfb.js`: ESPN player search, event logs, team and schedule context, and normalized game logs.
- `api/nhl.js`: NHL player search, game logs, career logs, and summary data.
- `api/tennis.js`: ESPN tennis search and match logs.
- `api/lol.js` and `api/riot.js`: League of Legends and Riot game data flows.
- `api/dota.js`: OpenDota player and match data.
- `api/cs2.js`: Grid and HLTV-backed CS2 search, caching, and game data.
- `api/trending.js`: PrizePicks projection retrieval, sport-specific player matching, game-log retrieval, hit-rate calculations, caching, and diagnostics.
- `api/trending-debug.js`: diagnostic variant of the Trending flow; it is not used by the main UI path.

## Reliability boundaries

- Upstream errors are converted to serverless JSON errors where the route handles them. The frontend now rejects non-JSON responses, surfaces HTTP errors, offers Try Again, and preserves the diagnostic payload for empty Trending results.
- ESPN-facing HTTP requests use the plain `curl/8.7.1` user agent. Core ESPN API calls retain their existing URLs and request behavior.
- Server-side caches exist in selected routes, including Trending's short-lived PrizePicks and result caches.

## Scope intentionally unchanged in Phase 0

The existing calculators, API response shapes, route names, stat definitions, and Check a Player presentation were not rewritten. Design-system and shell work belongs to later phases.
