# FretFree brand

Chosen on 2026-10-18 from the options in [`options/`](options/index.html) (live at brand.fretfree.app): mark D, palette D, a typeface replacing option E's IBM Plex, tagline 6, casing "FretFree".

## Name

**FretFree**, one word with two capitals. The domain is `fretfree.app`. "Fretwork" is the internal code name. It stays in identifiers (the Dexie database, the export file's `app` id, localStorage keys, CDK stack names) because renaming those would lose learners' data or replace infrastructure.

## Tagline

> Open the page. Pick up the guitar.

The two steps, and nothing else is needed: no install, no account, no cost.

## Mark

A guitar pick with a smile ([`assets/mark.svg`](assets/mark.svg)): learning the neck should feel light. In the app it's `app/src/shell/Logo.tsx`, which draws in `currentColor` with the smile cut out in `--logo-cut`. Below 20 px, thicken the smile (stroke 7 instead of 5).

- App icon: [`assets/app-icon.svg`](assets/app-icon.svg) and [`assets/app-icon-512.png`](assets/app-icon-512.png), a full-bleed plum square. The pick fills about 62%, inside the maskable safe zone. The PWA icons in `app/public/` are rendered from it.
- Favicon: [`assets/favicon.svg`](assets/favicon.svg), a rounded tile.

## Colour

Sunflower on deep plum. The tokens are in `app/src/styles/tokens.css`.

| Role | Dark | Light |
|---|---|---|
| Background | `#1b1626` | `#f7f5fa` |
| Raised | `#261f35` | `#ffffff` |
| Border | `#3a3050` | `#e3deea` |
| Text | `#f7f2ff` | `#2a2038` |
| Muted text | `#b4aaca` | `#5f5574` |
| `--accent` (brand text, borders) | `#f5c542` | `#765600` |
| `--accent-fill` (buttons) | `#f5c542` | `#f5c542` |
| `--accent-text` (on buttons) | `#1b1626` | `#2a2038` |
| Icon tile | `#2a2038` | `#2a2038` |

**Sunflower is for chrome only.** That means primary actions, the logo and active navigation. It sits near Okabe–Ito orange (`--root`) and yellow (chord fifths), which carry meaning on the neck. So it never appears on the fretboard or in drill feedback. The Okabe–Ito colours are fixed and don't change with the brand.

## Type

**Clear Sans** (Intel, Apache-2.0) for everything, at weights 400, 500 and 700. It's subset to Latin as woff2 in `app/public/fonts/` (about 20 KB per weight) and precached for offline use. Its licence is in `ClearSans-LICENSE.txt` next to the files. Option E's IBM Plex is under the SIL OFL, which the project's licence rule doesn't allow. Clear Sans has the same engineered, screen-first character. ♭ and ♯ aren't in the font and fall back to the system font.

## Voice

Friendly, short and plain. Celebrate real progress, and never nag or punish.

- Hero: "Open the page. Pick up the guitar."
- Empty state: "Nothing to review. Go noodle for a bit."
- Streak: "A whole week! Your fingers noticed."
