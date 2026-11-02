# PropScope implementation report

## Completed phases

- Phase 0: documented the architecture; changed Trending to cancel stale requests, reject non-JSON and HTTP failures, expose Try Again, and show API diagnostics for empty results; standardized the plain HTTP client user agent on the ESPN-facing routes.
- Phase 1: added the dark visual token layer, Inter and IBM Plex Mono typography split, shared radii and spacing, focus rings, 44px controls, reduced-motion handling, and a reusable skeleton class.
- Phase 2: added the responsive app shell, desktop rail, mobile navigation, slash-to-focus search, and URL state for the active tab and sport.
- Phase 3: replaced the Trending list presentation with a responsive props board using the existing API fields, including player search, direction, rate window, minimum hit rate, sorting, and honest empty states.
- Phase 4: added row selection and a detail drawer. Trending now returns the recent values it already fetched so the drawer can render hit and miss history without another data source.
- Phase 5: added half-point line steppers and quick line controls to Check a Player.
- Phase 7: added local-only saved props and a slim source and disclaimer footer.
- Follow-up: added sport/stat-aware quick-line presets, a PrizePicks line lookup card with an explicit Use Line action, a last-10 game-log bar chart, and global player search routing into Check a Player.
- Follow-up: fixed Trending player-log matching on Vercel preview deployments by using the stable production API host for the internal cross-route lookup while preserving localhost behavior.

## Intentionally left alone

- Existing stat calculators, sport-specific API routes, query parameter names used by those routes, and Check a Player fetch logic were preserved.
- Vite migration was not attempted. This repository has no package manifest or existing build setup, and the current single-file deployment is the lower-risk path for the iframe embed.
- The detail drawer does not invent unavailable median, high, low, home or away values. It renders only the rates and recent values returned by the current Trending flow.

## Validation

- All API files pass `node --check`.
- The inline React source passes Babel JSX parsing with optional chaining and nullish coalescing enabled.
- `git diff --check` passes.
- Each implementation phase is isolated in its own commit.
- Review-branch verification: the latest preview loaded Trending NBA rows, displayed PrizePicks lines, and loaded Shai Gilgeous-Alexander's 10-game bar chart plus paginated game log.

The temporary local browser preview could not reach the development server from the browser sandbox, so the required 390px, 768px, and 1280px screenshots were not captured in this run. No screenshot is represented as complete.

## Rollback

Each phase can be reverted by reverting its commit, newest first if rolling back multiple phases:

- Phase 7: `ea4923c`
- Phase 5: `5711f71`
- Phase 4: `de85027`
- Phase 3: `f140b7f`
- Phase 2: `ce88b17`
- Phase 1: `3dac3e6`
- Phase 0: `f3321ac`
- Follow-up line/chart work: `83e4f6b`
- Trending preview host fix: `c4102e6`
