# PropScope design system

## Direction

PropScope uses a dark, slim research-terminal visual language. Surfaces are separated by color and hairline borders. Green communicates a hit, over, or primary action. Red communicates a miss or under. Amber communicates a middle-range result or caution. Blue is reserved for informational context.

## Tokens

The shared token layer lives at the top of the `index.html` stylesheet:

- `--bg`: near-black application background.
- `--surface-1`, `--surface-2`, `--surface-3`: layered cards, controls, and raised surfaces.
- `--border`: low-contrast structural border.
- `--brand`, `--danger`, `--amber`, `--info`: semantic accent colors.
- `--text`, `--text-secondary`, `--text-muted`: text hierarchy.
- `--space-1` through `--space-5`: 8px-based spacing scale.
- `--radius-control`, `--radius-card`, `--radius-pill`: shared shape language.
- `--ease-out`: short interaction easing.

Use tokens in component styles and inline styles. Keep raw color values confined to the token definitions and existing data-source branding exceptions.

## Typography

- Inter is the default UI font.
- IBM Plex Mono is used for inputs, rates, table values, and other data-heavy numeric content.
- Syne is reserved for the PropScope wordmark and high-emphasis numeric display already using the existing rate-card treatment.
- Numeric content should use tabular figures so columns do not jump as values change.

## Components

- `.card`: primary content surface with a 10px radius and hairline border.
- `.tool-input` and `.stat-select`: 44px-class controls with visible focus rings.
- `.sport-btn`: reusable pill-like action and sport control with a 44px minimum tap target.
- `.check-btn`: primary action using the brand green token.
- `.rate-card`: shared hit-rate summary treatment.
- `.error-box`: error surface paired with a Try Again action where recovery is possible.
- `.skeleton`: loading surface for future table and chart loading states.

## Accessibility and motion

All interactive controls receive a visible focus ring. Touch-facing buttons use a 44px minimum height. Green and red are paired with labels, arrows, or state text rather than acting as the only signal. Reduced-motion users receive shortened transitions and disabled animation loops through `prefers-reduced-motion`.
