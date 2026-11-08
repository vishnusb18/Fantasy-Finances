# ATM landing and space entry

The running application at `http://localhost:5173/` now opens on the exact supplied ATM image. The existing app remains in `src/App.tsx`; none of its components, calculations, monthly behavior, source adapters or navigation were replaced.

## Changed and added files

- `src/main.tsx`: mounts `EntryExperience` around the unchanged app and loads the final space-theme overrides.
- `src/app/EntryExperience.tsx`: landing / entering / app state, exact-image rendering, transparent PLAY hotspot, loading/error handling, responsive sizing, input locking during entry and focus handoff to the existing Matchup heading.
- `src/app/entryGeometry.ts`: normalized screen/PLAY landmarks measured against the provided 1671 × 941 image; shared geometry keeps the image and hotspot aligned and ensures the zoom excludes the bezel.
- `src/app/SpaceBackground.tsx`: deterministic local SVG starfield and subtle violet nebula background. It has no financial state or external network dependency.
- `src/space.css`: 1.1-second screen-centered zoom and crossfade, 220 ms reduced-motion fade, dark midnight/plum atmosphere and existing gold foreground preservation.
- `public/images/atm-landing.png`: byte-identical copy of the user's `artifacts/v5/landingpage.png`, including the original metallic ATM and red pixelated PLAY artwork.
- `tests/entryGeometry.test.ts`: viewport bounds, minimum usable hotspot dimensions, image alignment, centered zoom and bezel exclusion across six desktop/mobile/landscape sizes.

The image copy has the same SHA-1 as the original: `7f5d52311762cedefa69cd332ca392fc5a6dbefe`.

## Flow

1. The full-screen landing shows the original image. No dashboard or extra visible button is rendered over it.
2. A native, transparent button covers the red PLAY artwork. It has the accessible name **Enter Fantasy Finance**, pointer cursor, keyboard focus outline and native Enter/Space behavior.
3. Entry mounts the existing app once, while it is hidden from assistive technology and inert. The image scales around the center of the ATM display while the ambient image fades and the starfield fills the viewport.
4. The existing Matchup screen fades in over the starfield as PLAY dissolves and the ATM zoom completes. Focus then moves to the Matchup heading. Navigation, tickets, bubbles, cars, standings, reports and finances remain the current app.
5. Reloading returns to the landing. Existing saved data-source, baseline, correction and goal behavior is unchanged.

## Palette and responsive treatment

The app background changes from bright violet to near-black violet (`#0b0716`), with a subtle local starfield, plum/indigo nebula shading, deep-plum navigation and lavender text. Existing champagne tickets and antique-gold panels remain the foreground identity.

The original image is landscape. Desktop uses a centered crop that covers the viewport. On tall phones, the crop is limited so the entire ATM display and PLAY artwork stay visible; a dimmed, blurred version of that same image fills the surrounding viewport. Only the extreme top/bottom image edges soften into that ambient layer. The ATM image itself is not regenerated or edited.

The final starfield is procedural artwork matched to the reference's dark-purple atmosphere, rather than a separate crop of its raster screen. The crossfade bridges the two without retaining the ATM or PLAY graphic behind the app. This is the intentional approximation in the space-background portion of the flow.

## Verification

- `npm test`: **107 tests passed**.
- `npm run build`: passed.
- `git diff --check`: passed.
- Local Chrome against the actual running app: the served landing image matches the original file byte for byte.
- Verified hotspot alignment, transparent background/border, pointer cursor, screen bounds and usable target size at 1440×900, 1920×1080, 390×844, 320×568 and 844×390.
- Verified clicking outside PLAY leaves the landing unchanged; mouse click, keyboard Enter, keyboard Space and touch tap activate entry. Keyboard focus is visible and then moves into the app.
- Verified the preparing app is inert, zoom scale increases around the display, and no ATM image/scene remains after entry. The final starfield is fully visible.
- Reduced motion disables the zoom and completes a short fade. Refresh restores the landing.
- Checked all four existing destinations at desktop and mobile widths: 16 category tickets, 80 bubbles, six illustrated racecars, six standings rows, paired report chart, interactive finance pie and financial month arrows remain operational. No horizontal overflow or browser errors appeared.

## Actual app screenshots

| View | Desktop | Mobile |
| --- | --- | --- |
| Landing | [Desktop](artifacts/atm-entry/landing-desktop.png) | [Mobile](artifacts/atm-entry/landing-mobile.png) |
| During entry | [Desktop](artifacts/atm-entry/entering-desktop.png) | [Mobile](artifacts/atm-entry/entering-mobile.png) |
| Matchup | [Desktop](artifacts/atm-entry/matchup-desktop.png) | [Mobile](artifacts/atm-entry/matchup-mobile.png) |
| League | [Desktop](artifacts/atm-entry/league-desktop.png) | [Mobile](artifacts/atm-entry/league-mobile.png) |
| Reports | [Desktop](artifacts/atm-entry/reports-desktop.png) | [Mobile](artifacts/atm-entry/reports-mobile.png) |
| My Finances | [Desktop](artifacts/atm-entry/my-finances-desktop.png) | [Mobile](artifacts/atm-entry/my-finances-mobile.png) |

## Direct PLAY-to-Matchup fade

The original ATM, PLAY hotspot and 1.1-second zoom remain unchanged. PLAY dissolves in the first 225 ms, while Matchup fades in from 18% to 76% of the same timeline. The ATM remains opaque through 50% and fades away by 90%, maintaining an overlapping handoff without a blank pause. There are no staggered card animations, slides or drops. Reduced motion retains the short fade.
