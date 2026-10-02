# Repository agent instructions

## Playroom motion

- Keep every Playroom and Omokmaru animation active by default, regardless of the operating system's animation or reduced motion setting. This includes the Playroom door and cards, Omokmaru UI, and 3D board effects.
- Do not add `prefers-reduced-motion` CSS overrides or JavaScript motion preference branches under `src/domains/games/`, `src/pages/playroom/`, or `src/pages/playroom.astro`.
- When changing or adding a game animation, extend the reduced motion browser regression in `tests/e2e/layout.spec.ts` and run it with `PREVIEW_PORT=<free-port> npx playwright test tests/e2e/layout.spec.ts --grep 'Playroom animations stay active under reduced motion'`.
- Keep this motion policy scoped to Playroom and Omokmaru. Other parts of the site may follow their own motion rules.
