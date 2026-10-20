# Verification of the 2026-10-20 learning-path review

The review (`2026-10-20-learning-path-review.md`) and its two copy audits were written at `9b0b8df`. This note checks each finding against main at **`1249751c`**, 94 commits later. Since `9b0b8df`, I1, I2, I7, D21, notation groundwork, the timing engine, the metronome, item kinds, M5-07/08 and M7-02 have shipped. It also checks the approved branches that are about to ship: `wp/M1-44`, `wp/M4-07`, `wp/M4-08`, `wp/M6-04`, `wp/M6-06`, `wp/M6-08` and `wp/M7-04`. Paths are under `app/src/` unless stated.

**Method.** I dumped the live skill graph from `engine/skills` (a throwaway vitest, not committed): 67 skills, with gates and item counts. A day-one session was simulated with `buildSession` and `orderFrontier` on the day-one skills. Every string in the copy audits was re-read at its current line.

**Bottom line.** None of the review's findings has been fixed by the work that shipped since `9b0b8df`. Two findings are being fixed by in-flight work: the Ear and Rhythm tracks (M4-07, M6-08), and most "Coming soon" modules (I4/I5 in M6-06). Two details in the copy audits are wrong. Some of WP A's proposed gates would break research/02 rule 7, which is normative. The filed WPs (M10-01, M10-02) keep the review's intent but express the gates so rule 7 still holds.

Verdicts: **TRUE** = still true on main; **FIXED**; **PARTLY**; **WRONG**; **IN FLIGHT** = an approved branch fixes it.

## Learning path (review §1)

| # | Finding | Verdict | Evidence on main | WP |
|---|---|---|---|---|
| 1.1 | Harmony and progressions aren't "open early": C8 needs C5.triads and C4.flat-key-degrees mastered; C5.triads needs four skills mastered; C9.pop needs C8 (144 items) mastered; C10 needs C5.triads mastered | TRUE | `engine/skills/c5.ts:111`, `c8.ts:72` (144 items, HARD), `c9.ts:37` (HARD), `c10.ts:46` (HARD); mastery = 90% of items at 7-day stability (`engine/config/mastery.ts`). New since the review: M4-07's progression-ear skills open with `C9.pop` (`wp/M4-07 engine/skills/i6.ts:98-101`), so they sit behind the same chain | M10-01, M10-02 |
| 1.1a | WP A's "C9.pop soft on C8 stage 1, which is soft on C5.triads practising" | PARTLY (conflicts with a rule) | `softUnlock` is per skill (`engine/mastery.ts:50-53`). Softening the chain makes progressions reachable with chord construction only *practising*, which breaks rule 7 ("chord construction → progressions", gated on mastery) | M10-01 adds per-prerequisite soft gates. M10-02 keeps C9.pop hard on C5.triads, soft on C8 stage 1 |
| 1.1b | WP A's "C6.triad-cores soft on C5.triads practising" | PARTLY (conflicts with a rule) | `c6.ts:43` gates on F2 ×2 + C5.triads. A whole-skill soft unlock would also soften F2 → CAGED, which is a rule-7 gate | M10-02 keeps F2 hard; whether C5.triads becomes soft is a user decision |
| 1.1c | C5.triads needs 4ths/5ths and flat keys though a triad needs neither | TRUE | `c5.ts:111`. A triad is two stacked 3rds, so `C3.thirds` satisfies rule 7's intervals gate | M10-02 |
| 1.2 | The frontier is a strict queue; parallel tracks starve | TRUE, and worse with in-flight work | `engine/frontier.ts:239-247` sorts by module rank, then `order`. `engine/session.ts:257-270` takes new items front to back. For "general", all C1+C2 items (about 300) come before C3/C4. In-flight I6 opens on day one (`wp/M4-07 i6.ts:60`, soft on F1.alphabet) and F4.pulse has no prerequisites (`wp/M6-08 f4.ts:44`), but both sit behind every core module | M10-03 |
| 1.2a | Songs/jazz learners "spell C♯ major and recite key signatures from day two or three"; I3 sits in the first promoted module | PARTLY | Keys (C4 + I3) is promoted for songs (`frontier.ts:202`), and C4.sharp-keys opens once F1.whole-steps is practising, so C♯ major does come within days. But I3 is ordered after all 159 C4 items within Keys (orders 1450+ vs 1400s), so signatures come weeks later, not on day 2–3. Moving I3's `order` to 1599.9 alone would not move it out of Keys (module rank sorts first) | M10-03 (decision: own module or reorder) |
| 1.3 | C2 is one 120-item skill; its ring reads 0% for weeks | TRUE | `engine/skills/c2.ts:16`, 120 items. In-flight M4-08 edits `c2.ts` (adds `hear-it-find-it`) | M10-12 (after M4-08) |
| 1.4 | First session too big: 86 prompts, about 20 new items from four skills | PARTLY | Simulated: 84 entries, **21 new items**, but from **2 skills** (F1.alphabet 14 + 7 of F2 string 6), not four. No cap in `engine/config/session.ts` | M10-03 |
| 1.5 | Ear and rhythm tracks missing; a third of the map is "Coming soon" | IN FLIGHT | On main, six modules have no skills (`screens/learn/map-model.ts:85`): Minor and function, Advanced, Rhythm, Ear, Meter, Reading. Triads, Arpeggios and Scales shipped since (I1, I2, I7). M4-07 (I6), M6-06 (I4/I5) and M6-08 (F4) fill three more, leaving Advanced, Meter and Reading | Grouping folded into M10-07 |
| 1.6 | "Locked: preview" previews nothing | TRUE | `map-model.ts:146,151`; `SkillDetail.tsx:26-28`. 45 of 67 skills have no worked example | M10-07 (with M10-04's intros) |
| 1.7 | Placement skips F3, C1, C6, C7, C10, I3; test-out is per module only | TRUE | `engine/config/placement.ts:8`; test-out only on `ModuleDetail.tsx:72-78` | M10-16 |
| 1.8a | No worked example for the C3 4ths/5ths G–B shift | TRUE | `learn/worked-examples/c3-gb-thirds.ts:10` targets only `C3.thirds` | M10-14 |
| 1.8b | Make I3.dominants a soft prerequisite of C8 stage 1 | Not filed | It would add a gate to the on-ramp M10-02 is shortening. The review's own goal is served better by I3 coming after C8 (M10-03) | — |
| 1.8c | C7.minor-boxes HARD on C6.minor-shapes | TRUE | `c7.ts:39`, HARD | M10-02 |
| 1.8d | C6.triad-cores needs C5.triads mastered | TRUE | `c6.ts:43` | M10-02 (decision) |
| 1.8e | Achievements: 8, all notes or streaks | TRUE (now 10) | `engine/gamification/achievements/`: notes, streaks, speed demon and two mic milestones (M5-07). None for chords, CAGED, harmony or progressions | M10-17 |

## Wording (review §2, both audits)

| # | Finding | Verdict | Evidence on main | WP |
|---|---|---|---|---|
| 2.1 | Skills have only a title; module summaries are tables of contents; raw topic codes | TRUE | `engine/model.ts:15-33`; `frontier.ts:32,52`; `SkillDetail.tsx:67` | M10-07 |
| 2.2 | D1, D3, D5, D39 give only the shared bar on a miss | TRUE | No `d1/d3/d5/d39Explain` exists (D2, D4, D6, D7, D11, D16 have one). Bar: `session/SessionScreen.tsx:297-298` | M10-05, M10-06 |
| 2.3 | The in-session "worked example" shows the answer, not a method; no concept intro | TRUE | `D1View.tsx:83`, `D3View.tsx:107`; `WorkedExample` used only in `SkillDetail.tsx` | M10-04, M10-13, M10-14 |
| 2.3a | "36 of 52 skills have no worked example" | PARTLY (count moved) | Now **45 of 67**: 9 files cover 22 skills, and the new I1, I2 and I7 skills have none | M10-13, M10-14 (the I-track gaps are left for later) |
| 2.4a | ASCII F#/Bb in D1–D4, D16 and the bar; no shared helper | TRUE | `theory/fretboard.ts:57-58`; 13 drills each have a private prettifier (d7 `logic.ts:90` … dpb `shared.ts:34`) | M10-05 (helper, D1, D3), M10-08 (D2, D4, D16) |
| 2.4b | b3/b7 in D6, D7 and the Chords callout | TRUE | D6 via `theory/intervals.ts:41,48`; `d7-spell-it/ContextPanel.tsx:27`, `logic.ts:366`; `frontier.ts:70` | M10-08, M10-07 |
| 2.4c | D5 abbreviations; W W H unexpanded in D7 | TRUE | `D5View.tsx:132`; `d7 ContextPanel.tsx:32`, `logic.ts:364` | M10-06, M10-08 |
| 2.4d | item / note / fact / card; learning/stable defined only once | TRUE | `today/cards/stats.tsx:50`; `progress/panels/stats.tsx:32`; `RetentionForecast.tsx:26`; `PlacementTest.tsx:451`; `ModuleDetail.tsx:94-100` | M10-09 |
| 2.4e | Progress topic names ≠ Learn module names | TRUE | `progress/panels/topics.tsx:15-37` (ten mismatches; F4, C3, C6, C7 and I2 match) | M10-09 |
| 2.4f | "All notes" vs "Every note on every string" as a module mismatch | WRONG | "Every note on every string" is the C2 *skill* title (`c2.ts:16`); the module is "Whole neck" | — |
| 2.4g | Direction words undefined except in D10 | TRUE | `d4 meta.ts:42-46`, `d6 logic.ts:258-259`, `D10View.tsx:138` | M10-08 (D4) |
| 2.4h | Two "goals"; "Ordered for your goal" ambiguous | PARTLY | `LearnScreen.tsx:138` sits next to a play-goal select, which mostly settles it | Not filed |
| 2.4i | Engineering leaks: "(and, softly, octaves)", "feeding your sessions" | TRUE | `frontier.ts:50,181`; `ModuleDetail.tsx:67-68` | M10-07, M10-09 |
| 2.4j | Welcome says settings change "in Progress" | TRUE | `onboarding/OnboardingFlow.tsx:103-104` | M10-10 |
| 2.4k | Reading step promises "its reading track moved up" | TRUE | `onboarding/steps/notation.tsx:22` | M10-10 (M8-21 also owns the file but is far from ready) |
| 2.4l | The Settings reading hint repeats that promise | WRONG | `screens/settings/SettingsGroups.tsx:241-242` has no "moved up" text, and didn't at `9b0b8df` either | — |
| 2.4m | Mic copy differs between D16 and D17 | TRUE | `D16View.tsx:32-36,281,294` vs `D17View.tsx:29-30,279,285` | M10-08 |
| A-§3 | Multi-target rounds never say a wrong tap ends the round or what Done does (D4, D9, D37, box) | TRUE | Only `D37View.tsx:214` | M10-08 (D4), M10-11 |
| A-§4 | D36 "quality", D38 notices, D40 prompts, D17 "Show me", D39 "fret 0 (open)" | TRUE | `D36View.tsx:125-126`; `D38View.tsx:86,159`; `d40 text.ts:84-88`; `D17View.tsx:305`; `d39 logic.ts:65` | M10-11, M10-08, M10-06 |
| A-§2.7–2.9, 2.11–2.12 | Panel headings, chord naming, correct-answer openers, open-string wording, apostrophes | TRUE (low impact) | as the audit cites | Apostrophes in M10-11; the rest not filed |
| S-§1 | "Fretting hand on the left"; "anything you don't know is skipped" | TRUE | `onboarding/options.ts:13`; `steps/placement.tsx:15` | M10-10 |
| S-§4 | Today: no day-one line; freezes unexplained; "restored shortly" | TRUE | `today/cards/hero.tsx:11-14`; `goal-ring/progress.ts:31`; `streak-repair.tsx:173` | M10-15, M10-10 |
| S-§6 | Heatmap legend and cell detail opaque | TRUE | `HeatmapLegend.tsx:20`; `CellDetail.tsx:39,62` | M10-10 |
| S-§7 | "add to home screen"; no Tap-time hint | TRUE | `PrivacyScreen.tsx:46-47`; `CalibrationSetting.tsx:14-18` | M10-10 |
| S-§8 | Speed demon is a fixed 1.2 s | TRUE | `engine/config/gamification.ts:27`. In-flight M6-08 edits `speed-demon.ts` (it leaves out timing drills) but keeps the fixed threshold | M10-17 (after M6-08) |
| S-§2 | Misconception callouts in teacher voice; none for Keys, Harmony, Arpeggios, Scales, Ear | TRUE | `frontier.ts:44,105,156` | M10-07 |

## Learning and help (review §3, §4)

| Finding | Verdict | Evidence | WP |
|---|---|---|---|
| The help panel leaks the answer: the note wheel shows every note at every guide level | PARTLY | Hidden at level 0 (`session/context/visibility.ts:13-14`). At levels 1–3, `d3-note-wheel/NoteWheel.tsx:86-87` names the 7 naturals, so for letter questions it *is* the answer. Sharps are unnamed dots at level 2 and named only at level 3 | M10-05 |
| A concept card before a skill's first guided rep | TRUE (missing) | no intro registry | M10-04 |
| Outcomes on skill and module rows | TRUE (missing) | — | M10-07 |
| Progression player (M4-09) and metronome (M8-20) unbuilt | FIXED | M4-09 (`d606eec9`) and M8-20 (`1249751c`) are done | — |
| Jargon glosses (tonic, degree, quality, voicing, spell…) | TRUE | as the audits cite | Partly in M10-08 and M10-11; a general glossary is not filed |

## Proposed WPs (review §5) → filed

| Review WP | Filed as | Notes |
|---|---|---|
| A songs on-ramp | **M10-01** (contract: per-prerequisite soft gates) + **M10-02** (gates and C8 stages) | Split, and rule 7 kept (1.1a, 1.1b). Stage 1 keeps the ID `C8.numerals-major`, so M4-07's I6 and the C9 prerequisites stay valid |
| B lanes + cap | **M10-03** | After M4-07 and M6-08 (both touch `session/runner.ts`). No Owns overlap with M10-02 |
| D concept intros | **M10-04** | No schema change: "first time" means the skill had no cards at session start. Kept off first-load JS (M1-44 headroom). After M6-08 (`SessionScreen.tsx`) |
| G method feedback | **M10-05** (D1, D3, plus the ♯/♭ helper and the wheel fade, review J) + **M10-06** (D5, D39) | Split for size. J folded in |
| F outcomes | **M10-07** | Outcomes in a lazy registry, not on `Skill`, for the first-load budget |
| H one vocabulary | **M10-08** (drills) + **M10-09** (screens) | |
| I copy fixes | **M10-10** (screens) + **M10-11** (drills) | |
| C split C2 | **M10-12** | After M4-08 (`c2.ts`) and M10-02 (`db.ts` hotspot, `export-import.ts`) |
| E worked examples | **M10-13** (Neck basics) + **M10-14** (C3, C7–C10) | |
| J note wheel fades | in M10-05 | |
| K Today first day | **M10-15** | |
| L placement C1/C6, test-out from map | **M10-16** | |
| M achievements | **M10-17** | Includes speed demon. After M6-08 |
| E (§1.5) collapse "Coming soon" | in M10-07 | Mostly moot once M4-07, M6-06 and M6-08 merge |

## Conflicts with in-flight work

- **M4-07** (I6 + D14): touches `session/runner.ts`; M10-03 runs after it. Its progression-ear skills gate on `C9.pop`, so M10-02 brings them forward too. Its day-one ear sets are what M10-03's third lane serves.
- **M4-08** (D15): edits `engine/skills/c2.ts`; M10-12 depends on it.
- **M6-08** (F4 + D20): touches `session/runner.ts`, `session/SessionScreen.tsx` and `achievements/speed-demon.ts`, so M10-03, M10-04 and M10-17 run after it.
- **M6-06** (I4/I5): gates on `C9.minor` / `C9.pop`, whose IDs M10-02 keeps. No conflict.
- **M1-44** (bundle): owns `engine/model.ts`, as M10-01 does (the `Skill` interface only), so they serialise. M10-04 and M10-07 must keep their content lazy to protect the headroom M1-44 wins back.
- **M7-05** (client sync, todo): M10-02 and M10-12 remap `skillId` on existing rows. Sync must restage rows pulled from a device on an older schema the way import does. A line has been added to M7-05's acceptance.
- **M8-21** (todo, far off): owns `onboarding/steps/notation.tsx` and `engine/frontier.ts`, as M10-10, M10-03 and M10-07 do. It isn't ready, so they go first.
