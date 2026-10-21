# Tab track (M9)

A short track for learners who want to read tab. It runs on the same engine as every other track: items, FSRS, speed grading, interleaving, worked examples and guide fading (design §3). The design rules in `docs/research/02-learning-science.md` apply in full.

Tab is easy to explain and quick to learn. It names a string and a fret, with no pitch decoding, so the track is small. The hard part is **fluency**: reading a line as a string and a number as a place on the neck without counting lines or frets. The track therefore trains speed as well as accuracy, and fades the string names the way the neck fades its labels.

## 1. Who gets it

| Learner                                                     | Tab track                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Wants to learn tab (`reading.learn.tab`, onboarding, M1-26) | **Promoted** in the frontier (M9-05)                                   |
| Already reads tab (`reading.reads.tab`)                     | Soft-unlocked. A short probe can test them out (M9-05)                 |
| Everyone else                                               | Soft-unlocked and previewable (design §3.4, §4). Nothing locks it away |

Tab ↔ fretboard drills are on when the learner reads or is learning tab (research/03, Track R note).

## 2. The tab model (`app/src/theory/tab.ts`)

Pure and deterministic, like the rest of `theory/`.

- **Lines ↔ strings.** Tab has one line per string, highest-pitched on top. Line 0 (the top line) is **string 1, high E**, which matches the theory numbering. `lineToString` and `stringToLine` convert, and both work for any tuning's string count.
- **Line names.** `tabLineName` gives the open note's pitch class, with the top line in lower case: `e B G D A E` in standard tuning, `e B G D A D` in drop D. `tabLines(tuning)` lists `{ line, string, name }` top first.
- **Fret tokens.** `'0'` to `'24'` (`MAX_FRET`). Leading zeros (`05`) and anything else are not frets. `parseFretToken` returns `null` for them; `formatFretToken` throws.
- **Phrases.** A phrase is a sequence of `{ string, fret }` events (`TabEvent`, the same shape as a fretboard `Position`), in playing order. Phrases are **single-note lines**: no chords, because every tab drill asks for one note at a time.
- **Plain text.** `formatTab` writes one column per event, two dashes either side, and a two-digit fret widens its column on every line:

  ```
  e|--3---------|
  B|-----5--12--|
  G|------------|
  D|------------|
  A|------------|
  E|------------|
  ```

  `parseTab` reads it back. It accepts one or more blocks (systems) of one line per string. Line names are optional, but if present they must match the tuning (enharmonics and case don't matter). It also accepts bar lines mid-line, spaces, and a missing closing bar. Columns count from each line's first bar line, so names of different widths still align.

- **Strict parsing.** `parseTab` throws a `TabParseError` with a line and column on: a block with the wrong number of lines, a misnamed line, a fret outside 0–24, a technique symbol (`h p / \ b x ~` …), or two notes that overlap in time. It reports these rather than guessing. Techniques and chords can be added later, as new event fields, without breaking the single-note phrase shape.
- `tabEventLabel` gives the VoiceOver label: "string 3, fret 5".

## 3. `<TabStaff>` (`app/src/components/tab/`)

An SVG built for touch, the tab partner of `<Fretboard>` (design §8). It is plain SVG with no notation library: tab is only lines and numbers, and VexFlow (M8-02) would cost bundle budget for nothing here.

| Prop                           | Meaning                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `notes`                        | `TabNote[]`: `{ string, fret, style?, hideFret? }`, one column each, in playing order                      |
| `minColumns`                   | Draw at least this many columns; fewer notes sit in the middle (D33 shows one note on a wider staff)       |
| `cursor`                       | Index of the phrase cursor (D35): drawn `current`, with a caret under the column and `aria-current="step"` |
| `lineMarks`                    | `{ string, style }[]` with style `selected` (a picked line), `correct` (flashes) or `wrong` (dashed)       |
| `guideLevel`                   | String-name fading (§5)                                                                                    |
| `onPickLine(string)`           | Makes each line a button for picking a string (D34)                                                        |
| `tuning`, `label`, `className` | As for `<Fretboard>`                                                                                       |

- **Shapes as well as colour** (Okabe–Ito tokens). Notes: `plain` is the number knocked out of the line; `current` gets a sky-blue rounded outline; `correct` a bluish-green circle that flashes; `wrong` a vermillion diamond; `ghost` a dashed outline. Lines: `selected` is a heavy sky-blue line on a tinted band; `correct` is green and flashes; `wrong` is vermillion **and dashed**.
- **Tap targets.** Each line's hit band is one line gap tall (48 design px). The SVG never renders below the scale that keeps that band at 44pt (`minScale`), and never above `MAX_SCALE` (1.25). On short screens (phone landscape, height < 500pt) it stays at the 44pt minimum so the staff and the neck both fit. A consumer on a narrow screen wraps it in a horizontal scroller, as the neck does.
- **Keyboard.** Line buttons take Enter and Space. Drills add their own shortcuts (e.g. 1–6 for strings).
- **VoiceOver.** The staff is a labelled group; each note is an image labelled "string 3, fret 5" (or "string 3, fret hidden" when `hideFret` hides the answer). Line buttons are labelled "string 3", plus the line name ("string 3, G") only while the guide level still shows that name, so VoiceOver users get the same guidance as sighted learners and no more.
- **Handedness.** Tab reads the same for left- and right-handed players, so `<TabStaff>` never mirrors. The neck beside it still does.
- **Reduced motion.** The flashes are CSS animations, which `prefers-reduced-motion` turns off globally.
- `--tab-knockout` (default `var(--bg)`) is the colour the numbers knock the lines out with. Set it when the staff sits on a raised surface.

## 4. Items and skills (M9-02)

Proposed IDs, following the existing convention of one ID per direction (`note@s6f5` / `find:G@s5`):

| Item             | Direction                                                | Drill |
| ---------------- | -------------------------------------------------------- | ----- |
| `tab@s3f5`       | tab → neck: read the note on the tab, tap it on the neck | D33   |
| `tab-write@s3f5` | neck → tab: see the cell, pick the line and the fret     | D34   |

- The skills cover single notes on each string at frets 0–12 (6 × 13 = 78 facts, each in both directions, research/02 rule 1).
- **Why one card per cell (decided in M9-02).** The alternative was 6 line ↔ string cards plus the existing neck-locating items. It was rejected because the track trains fluency, and fluency is per cell: reading line 4 / fret 9 as a place is slower than line 1 / fret 0, and FSRS can only schedule that gap if each cell has its own card, graded on its own response time (rules 2 and 3). No existing card asks "go to string 4, fret 9" either: `note@` names a note and `find:` finds a pitch class, so the cells don't duplicate them. `tab@` and `note@` stay separate kinds because knowing where is not knowing what.
- **Skills.** One per string, topic `TAB` (`engine/skills/tab.ts`, module `tab` in `engine/frontier.ts`): `TAB.string1`, then `string6`, `string2`, `string5`, `string3`, `string4`. Each soft-unlocks the next once it is practising; `TAB.string1` soft-unlocks after `F3.markers`, because finding fret 7 builds on the landmarks. Within a string, the open string and the inlay frets (0, 3, 5, 7, 9, 12) come first, as anchors. The skills stay out of the placement test; the track's own probe is M9-05's.
- **Order.** Introduce string by string, starting with the outer strings (1 and 6), whose lines are easiest to find. Each string is briefly blocked (3–5 reps), then interleaved (rule 6). Confusable pairs to mix deliberately: neighbouring lines (2/3, 4/5) and the two E lines (1/6): reading tab upside down, as if the low E were on top, is the classic beginner error. D33 keys the confusion matrix by line (`tab:line3`), and those three pairs are seeded in `engine/confusions.ts`.
- **VoiceOver (decided in M9-02).** `<TabStaff>` labels a note "string 3, fret 5" at every guide level, which would hand VoiceOver users the line → string step the track teaches. D33 therefore hides the staff's own labels and gives it one label by the note's place: "Tab, 6 lines: one note on the 3rd line from the top, at fret 5". It adds the line name and the string number only at the levels where the staff shows them. D34's line buttons will need the same treatment (M9-03).
- **Speed.** Grading uses correctness and response time against the learner's personal target (rules 2 and 3), exactly as for D1/D2. Fluency, not just accuracy, is the goal.
- Phrases (D35) are not cards of their own. They are built only from items the learner already knows, so new items stay blocked (rule 6).

## 5. Guide levels for tab

The neck's guide levels (design §3.5) apply to the neck in every tab drill. The tab staff has its own, which fade the string names at the left of the lines:

| Level | `<TabStaff>` shows                                              |
| ----- | --------------------------------------------------------------- |
| 3     | Every line's name and its string number (`e1 B2 G3 D4 A5 E6`)   |
| 2     | Every line's name (`e B G D A E`)                               |
| 1     | Only the top and bottom names (`e`, `E`): anchors to count from |
| 0     | Bare lines                                                      |

- The fret numbers always show. In tab they are the content being read, not guidance.
- Immediate correct-answer feedback stays on at every level (rule 9).
- In D34 the answer is a line, so a line's name never gives the answer away: it is the guide being faded. A drill that asks for the **fret** hides it with `hideFret`.

## 6. Drills

| ID  | Drill                                                                                                                                                                                                                                 | Input        | Package |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- |
| D33 | **Tab → neck.** One note on `<TabStaff>`; tap that cell on the neck                                                                                                                                                                   | tap          | M9-02   |
| D34 | **Neck → tab.** A highlighted cell; pick the tab line, then the fret (choice buttons and keyboard). A wrong line and a wrong fret get different feedback                                                                              | tap + choice | M9-03   |
| D35 | **Read a tab phrase.** 3–6 notes, 1–3 strings, one position. Tap them on the neck in order; the cursor shows the current note; a wrong tap shows the right cell and carries on. A correct phrase plays back (lazy Tone.js, design §9) | tap          | M9-04   |

Every drill follows **worked example → faded → independent** (rule 8): the first rep of a new item shows the answer (tab line highlighted, the cell marked, string names at level 3), and later reps hide it. A queried answer is never shown before the learner answers (rule 4, the M1-25 rule): in D33 the neck has no marker on the target cell; in D34 the tab is empty until the line is picked.

Layout, as D33 does it:

- **iPad.** The staff sits above the neck with both in view, as the staff does in M8 (§12). It is placed beside the prompt and the feedback line, so the whole neck fits below it.
- **Read-only staff.** A staff that is only read (D33, D35) is sized by height (about a quarter of the screen), not at `<TabStaff>`'s 44pt minimum. At that minimum it is 291pt tall and pushes the neck's low strings off an iPad in landscape.
- **Tappable staff.** A staff whose lines are tapped (D34) keeps the 44pt minimum.
- **Phone in portrait.** The staff sits above the 5-fret neck window.
- **Phone on its side.** The staff takes a left column beside the neck, and the neck window shrinks to the frets that still fit at 44pt cells (`d33CompactFrets`).

## 7. Relation to M8 R7 (tab ↔ staff)

R7 (research/03) is about **choosing a position**: reading a staff passage and writing it as playable tab, or reading tab and placing it on the staff.

- **Shared model.** R7 builds on `theory/tab.ts`. A staff passage plus a chosen position gives a `TabPhrase`, which `formatTab` writes and `<TabStaff>` draws. Going the other way, a `TabPhrase` gives pitches through `midiAt`.
- **Tab gives position, the staff gives pitch.** Tab is unambiguous about where to play but says nothing about rhythm; the staff is the reverse. R7 drills exercise exactly that gap: "here is the staff phrase, pick a playable position and write the tab".
- **Tab under the staff.** Design §12 suggests VexFlow's `TabStave` under the staff, fading at lower guide levels. Two options for M8-02/M8-17:
  1. Use VexFlow `TabStave`, so its columns align with the staff notes automatically, and keep `<TabStaff>` for the tab-only drills.
  2. Use `<TabStaff>` everywhere for one look and one set of a11y labels. This needs a new `columnX` input so its columns can follow VexFlow's note positions.

  Either way, both tracks share the model and the guide-fading rule (names fade first, fret numbers stay). The choice belongs to M8-02, which owns the VexFlow dependency.

- **Prerequisites.** Neither track requires the other. A learner who reads tab gets R7 as a bridge into staff reading; one who reads staff gets it as a bridge into tab.

## 8. Explore: Tab viewer

`screens/explore/views/tab-viewer.tsx` shows a short lick on `<TabStaff>` above the neck. Tapping a line highlights it and marks that string's notes on the neck. It is reference only, with no grading, and gives the e2e suite a place to render the component (`app/e2e/m9-01.spec.ts`).
