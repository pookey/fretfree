# Backlog

Work packages (WPs) for M1–M6 and the future M8 (design §11, §12). The `fretwork-orchestrator` skill reads this file, so **keep the format exact**.

## How this backlog is shaped for parallelism

- **Small:** each WP is ½–2 hours of agent work.
- **Contracts first.** WPs marked **[contract]** land types, registries and interfaces that others build against. Run them first and merge them fast.
- **Vertical slices in new files.** A drill is a new `app/src/drills/<id>/` folder (auto-registered). A skill topic is a new `app/src/engine/skills/<topic>.ts` (auto-registered). Screens, Today cards, Progress panels, Explore views and onboarding steps all become one-file-per-entry registries in M1-01.
- **After** (optional) is a *soft* ordering. By default a WP waits for its After packages too, but when slots would otherwise be idle the planner may start it once its real **Deps** are done. M8 uses this to stay "future" without wasting capacity.
- **Priority** (optional): `high` puts a ready WP ahead of everything else in the planner, contracts included. Use it for work the user asked to bring forward, and say why.
- **Owns** lists the files and folders a WP may create or change. Two WPs whose Owns overlap must not run at the same time. Globs mean "this folder".
- **Hotspots** are shared files that only one in-flight WP may touch at a time, whatever the Owns say:
  - `app/src/session/runner.ts`
  - `app/src/storage/db.ts` (schema versions)
  - `app/src/engine/session.ts`
  - `app/src/shell/AppShell.tsx`
  - `package.json` / `pnpm-lock.yaml` (dependency changes)
- Every WP adds its own e2e spec as `app/e2e/<wp-id>.spec.ts` (lower-case ID, e.g. `m1-04.spec.ts`) when it has UI. iPad projects get the full flow; tag a phone-relevant happy path `@smoke`.
- **Definition of done for every WP:**
  - its acceptance criteria are met;
  - tests are added;
  - `pnpm verify` is green in the worktree;
  - the learning-science rules in research/02 are respected;
  - iPad-first layout (design §7) is followed.

Status values: `todo` · `in-progress` · `review` · `done` · `blocked`. Only the orchestrator edits statuses.

## Milestone overview and lanes

| Lane | M1 | M2 | M3 | M4 | M5 | M6 |
|---|---|---|---|---|---|---|
| Contracts | 01, 02 | 01 | 01 | 01 | 01 | 01 |
| Drills (new folders) | 04, 05 | 03, 05, 06 | 02, 04, 05, 06 | 02–04, 07, 08 | 05, 06 | 02–04, 08, 09 |
| Skills content (new files) | 03 | 02, 04 | 02, 03, 05 | 02, 04, 05, 07 | — | 02–07 |
| Gamification | 08–10, 12, 13 | 10 | — | — | 07 | — |
| Screens / UX | 06, 07, 11, 14, 16, 18, 22 | 07, 11, 12 | 07–11 | 05, 09, 10 | 03, 04 | — |
| Engine / session (hotspots) | 15, 17 | 08, 09, 13 | — | 06 | 02 | — |
| Quality | 19, 20, 24 | 14 | 12 | 11 | 08 | 10 |

**M9 (tab reading)** was added from user feedback (2026-10-18). It's a small track, so a learner who picks "I'd like to learn to read tab" gets real lessons. It has no `After` and runs in normal priority order (after ready M1–M6 work, ahead of the deferred M8).

**M10 (learning-path fixes)** comes from the learning-path review of 2026-10-20 (`docs/review/2026-10-20-learning-path-review.md`, verified against main in `docs/handoff/08-review-verification.md`). Its first six WPs are `Priority: high` in the review's order: the songs on-ramp (M10-01, M10-02), session lanes (M10-03), concept intros (M10-04) and teaching feedback (M10-05, M10-06).

**M8 (future: reading and meter)** has its own section at the end. Its timing-engine contract (M8-01) is shared with M6-08 and scheduled early. The rest follows M6 via soft `After` ordering.

Milestones group features; they are **not** release gates. Every merged WP ships (`pnpm ship`). Packages from later milestones may start as soon as their dependencies are `done`.

---

## M1: Fretboard notes MVP

### M1-01 · [contract] One-file-per-entry registries for routes, Today cards, Progress panels, Explore views and onboarding steps
- **Status:** done
- **Deps:** —
- **Design:** §7
- **Owns:** `app/src/App.tsx`, `app/src/routes/**`, `app/src/screens/**`, `app/src/shell/nav.ts`, `app/e2e/m1-01.spec.ts`
- **Acceptance:**
  - Routes are discovered from `app/src/routes/*.route.tsx` via `import.meta.glob`. Each file exports `{ path, element, nav?: { label, icon, order }, layout: 'shell' | 'fullscreen' }`. Today, Learn, Explore, Progress and Session move to route files. The sidebar and tab bar read nav entries from the registry.
  - Today composes cards from `app/src/screens/today/cards/*.tsx`. Each card exports `{ id, order, Card }`. The hero and stats become cards.
  - Progress composes panels from `app/src/screens/progress/panels/*.tsx`. Stats, settings and data export become panels.
  - Explore lists views from `app/src/screens/explore/views/*.tsx` (`{ id, title, order, View }`). The current fretboard explorer becomes the first view. *(Since M3-16, each view is two files: `views/<id>.meta.ts` exports `id`, `title`, `order`, and `views/<id>.tsx` exports only a lazily loaded `View`.)*
  - `app/src/onboarding/steps/*.tsx` registry contract (`{ id, order, title, Step, skippable: true }`). An empty registry is fine; M1-06 fills it.
  - Unit tests cover registry ordering. The existing e2e suite passes unchanged, and `m1-01.spec.ts` checks that nav is generated from the registry.

### M1-02 · [contract] Gamification contracts and repository
- **Status:** done
- **Deps:** —
- **Design:** §3.7
- **Owns:** `app/src/engine/gamification/types.ts`, `app/src/engine/gamification/index.ts`, `app/src/storage/gamification-repo.ts`, `app/src/storage/gamification-repo.test.ts`
- **Acceptance:**
  - Types are defined for XP events, a `GamificationEvent` union (answer, session-complete, goal-met, streak-extended, freeze-used, streak-repaired, achievement-unlocked, quest-completed) and achievement and quest definitions.
  - Pure function signatures are documented, with stubbed modules that the M1-08/09/13 WPs fill: `xpForAnswer`, `applyDay`, `checkAchievements`.
  - The repository functions read and write `gamification`, `dailyProgress`, `achievements` and `gamificationEvents` (tables already in schema v1). Every event is logged via `logEvent`.
  - Local-date helpers (`YYYY-MM-DD` in the device time zone, DST-safe) are tested.

### M1-03 · F1 and F3 skills, plus bidirectional F2/C2 items
- **Status:** done
- **Deps:** —
- **Design:** §3.1, research/03 F1–F3
- **Owns:** `app/src/engine/skills/f1.ts`, `app/src/engine/skills/f3.ts`, `app/src/engine/skills/f2.ts`, `app/src/engine/skills/c2.ts`, `app/src/engine/skills/*.test.ts`, `app/src/engine/model.ts` (item-ID helpers only)
- **Acceptance:**
  - F1 skills (musical alphabet steps, half and whole steps, B–C/E–F) generate `step:+2@E`-style items.
  - F3 skills (marker landmarks 3/5/7/9/12, the 12th-fret repeat) generate items.
  - F2 and C2 add name→position items (`find:G@s5`) next to the existing position→name items, per research/02 rule 1.
  - Item-ID helpers and parsers live in `model.ts`, with round-trip tests.
  - Every item ID is stable and unique, and prerequisites form a DAG (tested).

### M1-04 · D2 "Find the note" drill (tap the neck)
- **Status:** done
- **Deps:** M1-03
- **Design:** §6 D2, §7 session, §8
- **Owns:** `app/src/drills/d2-find-the-note/**`, `app/e2e/m1-04.spec.ts`
- **Acceptance:**
  - The drill tests `find:<pc>@s<n>` items. The learner taps the cell on the given string. Scope levels (one string → region → whole neck) feed the adaptive controller.
  - On iPad the whole neck is shown, with the active region dimmed outside it. Compact uses a sliding 5-fret window.
  - Wrong taps show both positions and play both notes. Guided first reps show the target.
  - Keyboard path: arrow keys move a focus cell and Enter taps. VoiceOver labels don't leak the answer.
  - The pure logic is unit-tested (≥90%). The e2e test covers a full prompt on the iPad profiles.

### M1-05 · D3 "Note-wheel steps" drill
- **Status:** done
- **Deps:** M1-03
- **Design:** §6 D3
- **Owns:** `app/src/drills/d3-note-wheel/**`, `app/e2e/m1-05.spec.ts`
- **Acceptance:**
  - The prompt reads like "a whole step above E?". Choices follow the accidental preference and are spelled correctly.
  - The context panel shows the note wheel, highlighting B–C and E–F. It fades with the guide level.
  - The drill is unit-tested and keyboard-answerable (A–G, Shift for sharps).

### M1-06 · Onboarding flow shell
- **Status:** done
- **Deps:** M1-01
- **Design:** §4
- **Owns:** `app/src/onboarding/**` (except steps owned by M1-07), `app/src/routes/onboarding.route.tsx`, `app/src/App.tsx`, `app/src/routes/registry.ts`, `app/e2e/m1-06.spec.ts`
- **Acceptance:**
  - Extend the route contract (M1-01) with an optional guard or loader so a route can redirect, and use it so that first launch routes to onboarding. Steps: handedness and tuning, goal, daily goal (Casual 5 / Regular 10 / Serious 15 / Intense 20), notation, session length.
  - Every step is skippable, and the whole flow takes under 3 minutes. Choices persist to settings and gamification.
  - The iPad layout is two-pane (explanation on the left, choice on the right) at regular-wide.
  - The About copy explains "adapts to what you know, not a learning style".
  - The e2e test completes and skips the onboarding.

### M1-07 · Latency calibration step
- **Status:** done
- **Deps:** M1-06
- **Design:** §3.2, §4 step 5
- **Owns:** `app/src/onboarding/steps/calibration.tsx`, `app/src/onboarding/calibration/**`, `app/e2e/m1-07.spec.ts`
- **Acceptance:**
  - About 20 seconds of "tap the lit dot" on the neck. The baseline is the median tap latency, trimmed of outliers, stored in `settings.latencyBaselineMs`.
  - It can be re-run from Progress → Settings.
  - The pure statistics are unit-tested.

### M1-08 · XP engine
- **Status:** done
- **Deps:** M1-02
- **Design:** §3.7 XP
- **Owns:** `app/src/engine/gamification/xp.ts`, `app/src/engine/gamification/xp.test.ts`
- **Acceptance:**
  - XP per answer is weighted toward learning value. Due reviews and new items earn more than over-practised stable cards. There is a small fluent bonus. Wrong answers earn base XP.
  - XP from a card decays if the card has already been drilled today.
  - All weights live in `engine/config/gamification.ts`.
  - Property-style tests show that grinding a stable card can never out-earn doing due reviews.

### M1-09 · Streak engine: daily goal, freezes, weekend amulet, repair
- **Status:** done
- **Deps:** M1-02
- **Design:** §3.7 streak rows
- **Owns:** `app/src/engine/gamification/streak.ts`, `app/src/engine/gamification/streak.test.ts`
- **Acceptance:**
  - A pure `applyDay(state, dayProgress, date)` returns the new state plus events.
  - Meeting the daily goal extends the streak. The learner earns 1 freeze per 7-day streak, holds at most 2, and freezes are used automatically on a missed day.
  - The weekend amulet skips Saturday and Sunday. A repair window of 48 hours allows a restore via a double session.
  - Milestones fire at 7, 30, 100 and 365 days.
  - Tests are exhaustive over calendar edge cases (DST, month and year boundaries, a gap of several days).

### M1-10 · Daily progress wiring
- **Status:** done
- **Deps:** M1-08, M1-09
- **Design:** §3.7 engine wiring
- **Owns:** `app/src/session/runner.ts` (hotspot), `app/src/session/gamification-bridge.ts`, `app/src/session/*.test.ts`
- **Acceptance:**
  - Each answer adds XP. Session minutes accumulate into today's `DailyProgress`. `goalMet` flips when the daily goal is reached, and the streak state updates on session finish.
  - Every event is logged. When the due and new queue runs dry, the builder tops up with interleaved frontier "stretch" items, never with non-due stable cards.
  - Runner tests cover the goal being reached mid-session.

### M1-11 · Today hero and sidebar streak
- **Status:** done
- **Deps:** M1-01, M1-02
- **Design:** §7 Today, §3.7
- **Owns:** `app/src/screens/today/cards/hero.tsx`, `app/src/components/goal-ring/**`, `app/src/shell/StreakBadge.tsx`, `app/e2e/m1-11.spec.ts`
- **Acceptance:**
  - The streak flame and counter plus the daily-goal ring are the Today hero. Freezes held and the due/new counts are shown.
  - The iPad sidebar always shows the streak and ring. They are compact in the icon sidebar and absent on the phone tab bar.
  - The ring animates unless reduced motion is on. It meets WCAG AA contrast and has VoiceOver labels.

### M1-12 · Session celebrations
- **Status:** done
- **Deps:** M1-08
- **Design:** §3.7 celebrations, §3.3 step 5
- **Owns:** `app/src/session/summary/**`, `app/src/components/confetti/**`, `app/e2e/m1-12.spec.ts`
- **Acceptance:**
  - The summary screen shows XP earned, items improved, accuracy, "perfect session" and "new personal-best speed", plus "come back tomorrow" spacing copy.
  - A combo counter appears during the session.
  - Confetti fires only for milestones and is disabled under reduced motion.
  - The copy celebrates competence ("you now know string 6 to fret 12").

### M1-13 · First achievements
- **Status:** done
- **Deps:** M1-02
- **Design:** §3.7 achievements
- **Owns:** `app/src/engine/gamification/achievements/**`, `app/src/screens/progress/panels/achievements.tsx`, `app/e2e/m1-13.spec.ts`
- **Acceptance:**
  - One file per achievement definition (auto-registered): "String 6 master", "String 5 master", "Whole neck (C2)", "Speed demon (median < 1.2 s)", and streak 7/30/100/365.
  - `checkAchievements` is pure and tested. Unlocks persist with a toast and appear in the Progress panel.
  - Achievements are tied to mastery, not activity counts.

### M1-14 · Progress fretboard heatmap
- **Status:** done
- **Deps:** M1-01
- **Design:** §7 Progress
- **Owns:** `app/src/screens/progress/panels/heatmap.tsx`, `app/src/components/heatmap/**`, `app/e2e/m1-14.spec.ts`
- **Acceptance:**
  - The full neck shows per-cell mastery: colour = stability, dimmed = slow (median RT > target).
  - The colours form a colour-blind-safe sequential scale with a legend. Tapping a cell shows its stats.
  - It includes a retention forecast ("you'll remember ~92% of string 5 next week") computed from FSRS retrievability.
  - Pure aggregation is unit-tested.

### M1-15 · Guide fading across drills, and blind mode
- **Status:** done
- **Deps:** M1-04
- **Design:** §3.5
- **Owns:** `app/src/engine/guides.ts`, `app/src/engine/guides.test.ts`, `app/src/drills/d1-name-the-note/**`, `app/src/screens/progress/panels/settings.tsx`
- **Acceptance:**
  - Guide level changes within a session as well as across sessions: fade after N consecutive fluent answers, restore after errors.
  - D1 and the neck honour levels 0–3 exactly as in the §3.5 table. A blind-mode setting hides inlays at level 0.
  - Immediate correct-answer feedback stays on at every level.

### M1-16 · Learn screen: module cards, mastery rings and goal ordering
- **Status:** done
- **Deps:** M1-01, M1-03
- **Design:** §5, §7 Learn, §4 goal
- **Owns:** `app/src/screens/learn/**`, `app/src/routes/learn.route.tsx`, `app/src/engine/frontier.ts`, `app/src/engine/frontier.test.ts`, `app/e2e/m1-16.spec.ts`
- **Acceptance:**
  - The module map from §5 shows mastery rings. Locked modules can be previewed (soft unlocking).
  - On iPad it is two-pane: the map on the left, skill detail on the right.
  - The goal profile reorders frontier skills (pure `orderFrontier(skills, goal)`, tested). The session builder consumes it via its existing `frontier` input.

### M1-17 · Multi-drill sessions and in-session learning steps
- **Status:** done
- **Deps:** M1-04, M1-05, M1-10
- **Design:** §3.3
- **Owns:** `app/src/session/runner.ts` (hotspot), `app/src/engine/session.ts` (hotspot), `app/src/session/drill-picker.ts`
- **Acceptance:**
  - Each item is served by an appropriate drill (D1/D2/D3, bidirectional), varying the drill for the same fact (rule 12).
  - Learning-step cards that FSRS makes due within minutes reappear later in the same session.
  - New blocks get a worked example, then 3–5 guided-to-independent reps.
  - The session ends at the time budget and shows the remaining time.

### M1-18 · Today quick drills
- **Status:** done
- **Deps:** M1-01, M1-17
- **Design:** §7 Today
- **Owns:** `app/src/screens/today/cards/quick-drills.tsx`, `app/e2e/m1-18.spec.ts`
- **Acceptance:**
  - "2-minute fretboard warm-up" starts a short session limited to due fretboard items, or frontier items when nothing is due.
  - Session options are passed through route state. The runner already supports `maxItems`.

### M1-19 · Offline, install and performance gates
- **Status:** done
- **Deps:** M1-01
- **Design:** §10
- **Owns:** `scripts/check-bundle.mjs`, `app/e2e/m1-19.spec.ts`, `app/src/shell/InstallHint.tsx`, root `package.json` (verify script only; hotspot)
- **Acceptance:**
  - The e2e test proves the app works offline after first load (`context.setOffline(true)`, a full session).
  - The first-load JS budget (≤250 KB gzip, excluding lazily loaded audio) is checked in `pnpm verify`.
  - An iPad "Add to Home Screen" hint appears in Safari, and not in standalone mode.
  - A Lighthouse PWA/a11y check runs locally (documented and scripted) and passes.

### M1-20 · Compact (iPhone) polish
- **Status:** done
- **Deps:** M1-04
- **Design:** §7 (iPhone best-effort)
- **Owns:** `app/src/shell/size-class.ts`, `app/src/shell/ScreenLayout.tsx`, `app/e2e/m1-20.spec.ts`
- **Acceptance:**
  - Short landscape phones get a wider neck window (more frets, letterboxed) rather than a tall 5-fret one.
  - The session context panel becomes a sheet on compact.
  - Multi-target drills fall back to region-by-region on compact.
  - The iPhone smoke project stays green with no horizontal overflow.

### M1-22 · Settings, sound and About
- **Status:** done
- **Deps:** M1-01
- **Design:** §4, §9, §1
- **Owns:** `app/src/screens/progress/panels/settings.tsx`, `app/src/routes/about.route.tsx`, `app/src/screens/about/**`, `app/e2e/m1-22.spec.ts`
- **Acceptance:**
  - Settings include accidental preference, volume slider, sound on/off, tuning (standard or Drop D), notation, session length, daily goal, weekend amulet, and re-running calibration.
  - The About page covers the evidence-based approach and privacy (no analytics, local data).
- **Note:** M1-15 also adds the blind-mode toggle to `settings.tsx`. Don't run M1-15 and M1-22 at the same time.

### M1-25 · [hotfix] Recall prompts must never show their answer
- **Status:** done
- **Deps:** none
- **Design:** §3.5, research/02 (retrieval practice)
- **Owns:** `app/src/components/fretboard/Fretboard.tsx`, `app/src/components/fretboard/Fretboard.test.tsx`, `app/src/drills/d1-name-the-note/D1View.tsx`, `app/src/drills/d1-name-the-note/*.test.tsx`, `app/e2e/m1-25.spec.ts`
- **Acceptance:**
  - Reported from production: a new learner sees "Name the highlighted note" with the answer printed on the highlighted cell. `Fretboard.tsx` labels every marker at `guideLevel >= 3`, and D1 always passes the answer as the target's `label`, so `forceLabel: guided` doesn't hide it.
  - The queried cell (a `target` marker) is never labelled by guide level. Only `forceLabel` (worked example, answer feedback) can show it. Level 3 still labels other markers as §3.5 says.
  - D1 doesn't pass the answer as the target label in unguided prompts (defence in depth).
  - No other text on the neck reveals the answer in an unguided prompt. In particular, the string-name label at the nut is hidden for the target's string when the target is at fret 0 or 12.
  - RTL tests cover guide levels 0–3 × guided/unguided/feedback. An e2e test (`m1-25.spec.ts`, tagged `@smoke`) checks that after the worked example, the unguided prompt for a fresh learner doesn't show the answer on the neck.

### M1-27 · [hotfix] D3: say "note", and answer by tapping the neck
- **Status:** done
- **Deps:** none
- **Design:** §6 D3, research/02 (retrieval in the target context)
- **Owns:** `app/src/drills/d3-note-wheel/**`, `app/e2e/m1-27.spec.ts`, `docs/design/app-design.md`
- **Acceptance:**
  - User feedback: "it's saying what 'letter' is before C — why 'letter' rather than 'note'?" The F1 musical-alphabet prompts say "letter" so they aren't confused with half steps (the note after C could be C♯), but a learner reads it as jargon. Reword every learner-facing "letter" in D3 (prompt, worked example, context-panel copy, the note wheel's aria-label) in terms of notes and the musical alphabet, e.g. "The note before C in the musical alphabet?" and "2 notes after E in the musical alphabet?". Step prompts ("A whole step above E?") are unchanged. Internal identifiers (`letter:` item IDs, `D3Kind`) stay.
  - User feedback: "clicking on the fretboard should be the same as pressing the letters, as that's the actual skill we're trying to teach." The D3 neck becomes an answer surface (`onTapCell`). Tapping any cell whose pitch class is the expected answer counts as that answer, with the same grading, response time and FSRS path as a button. A wrong tap is graded wrong, and feedback marks the tapped cell as `wrong` and the expected cells as `correct`. The note buttons and the A–G keyboard path stay.
  - Natural-only (`letter`) items still accept a tap on the natural's cell only. Tapping a sharp/flat cell is wrong.
  - Nothing on the neck reveals the answer in an unguided prompt (M1-25): only the start marker is labelled, and tap targets carry no note names in their accessible labels before answering.
  - Neck cells stay ≥44pt on iPad. The prompt copy tells the learner they can tap the neck or a button.
  - Design §6 D3 records both changes. Unit tests cover the new wording and tap → answer mapping. An e2e test (`m1-27.spec.ts`, iPad projects, happy path tagged `@smoke`) answers one prompt by tapping the neck.

### M1-28 · [hotfix] Wrong-answer feedback and Continue always on screen
- **Status:** done
- **Deps:** none
- **Design:** §7 session, research/02 (immediate feedback)
- **Owns:** `app/src/session/SessionScreen.tsx`, `app/src/session/SessionScreen.module.css`, `app/src/session/SessionScreen.test.tsx`, `app/e2e/m1-28.spec.ts`
- **Acceptance:**
  - User feedback from an iPad: after a wrong answer, "That was B. You'll see it again shortly." and its **Continue** button were below the fold. The learner didn't know to scroll, so the app seemed frozen. M1-20 saw the same on phones held sideways. The cause is that `.feedbackBar` is the last item in the drill area, under the neck.
  - The feedback bar is always visible without scrolling on every supported viewport: iPad landscape and portrait, iPad mini, iPhone portrait and landscape. Pin it to the bottom of the session viewport (sticky or fixed, respecting `--safe-bottom`), and pad the drill area so it never covers the neck or the answer buttons while a prompt is open.
  - The wrong-answer state is unmistakable. The bar appears with a short, reduced-motion-safe entrance, and Continue gets focus. **Enter** or **Space** continues (keyboard), and so does a tap on Continue. Correct answers keep their brief "✓" and auto-advance.
  - The fix is in the session shell, so it covers every drill (D1–D6 and future ones) with no per-drill changes.
  - E2E (`m1-28.spec.ts`, all iPad projects, iPhone tagged `@smoke`): answer wrong in each registered drill reachable through `focusSession` and assert that Continue's bounding box lies inside the viewport with no scrolling (`window.scrollY` unchanged), and that Enter continues. RTL covers focus and keyboard.

### M1-29 · "Add to Home Screen": an onboarding step and a Today card
- **Status:** done
- **Deps:** none
- **Design:** §2 (installed PWA on iPad), §4 onboarding, §7 Today
- **Owns:** `app/src/onboarding/steps/install.tsx`, `app/src/onboarding/steps/install.module.css`, `app/src/screens/today/cards/install.tsx`, `app/src/screens/today/cards/install.module.css`, `app/src/shell/install.ts`, `app/src/shell/InstallHint.tsx`, `app/src/shell/InstallHint.module.css`, `app/src/shell/AppShell.tsx` (hotspot), `app/e2e/m1-29.spec.ts`
- **Acceptance:**
  - User request (2026-10-18): a screen that suggests adding the app to the Home Screen, during the setup wizard, with the same tip on the dashboard (Today).
  - **Onboarding step, first in the flow** (lowest `order`). Shown only where the app can be installed and isn't running standalone (reuse `installPlatform`, moved to `shell/install.ts`). It explains why: full screen, works offline, one tap to practise, and progress is kept safe. It shows illustrated steps for Safari's Share → "Add to Home Screen" (iPad: top right; iPhone: bottom), and offers "Continue in the browser" so it's never a gate.
  - **Storage caveat; check this on current iPadOS and record it in design §2:** a Home Screen web app on iOS/iPadOS has its own storage, separate from Safari. That's why the step comes before anything is saved. Its copy says to open the app from the Home Screen and finish setup there. If the learner already has progress in this browser, the step and card say it won't carry over automatically, and offer Export (Progress → Your data) for importing in the installed app. Once M7 sync exists, signing in is the alternative.
  - **Today card** (`screens/today/cards/install.tsx`): the same tip in compact form, under the same conditions. It can be dismissed and stays dismissed per device (reuse `DISMISS_KEY` handling), and it never shows in standalone mode. The global banner in `AppShell` is removed so the tip doesn't show twice. (The old-host clause was dropped when guitar.dwellsee.com was retired on 2026-10-18; `MovedNotice` no longer exists.)
  - Other browsers, best effort: iOS Chrome or Edge (iOS 16.4+ can add to the Home Screen from their share menu) get matching instructions. Where `beforeinstallprompt` fires (Chromium desktop, Android), offer an Install button.
  - Copy uses the current product name. The infra session is rebranding to "FretFree", so rebase over it if it lands first. iPad-first layout, a11y (Lighthouse 100), reduced motion.
  - Unit tests for platform detection (the iPadOS Mac UA case) and dismissal, RTL tests for the step and the card, and an e2e test (`m1-29.spec.ts`) with an iPad Safari UA (step shown first, card on Today, dismiss persists) and a standalone emulation (neither shows).

### M1-26 · Reading question: what you can read, and what you want to learn
- **Status:** done
- **Deps:** none
- **Design:** §3.6, §4, §12, research/03 Track R
- **Owns:** `app/src/onboarding/steps/notation.tsx`, `app/src/onboarding/options.ts`, `app/src/onboarding/steps/steps.test.tsx`, `app/src/engine/model.ts`, `app/src/storage/repository.ts`, `app/src/storage/storage.test.ts`, `docs/design/app-design.md`, `docs/research/03-curriculum.md`, `app/e2e/m1-26.spec.ts`
- **Acceptance:**
  - User feedback: "Do you read music? Tab / standard / none" sounds as if Fretwork won't teach the ones you don't pick. The step now asks two things, and both are multi-select:
    - **"What can you already read?"** Tab, Standard notation (both allowed; neither is fine and is the default).
    - **"What would you like to learn to read?"** Tab, Standard notation (both allowed; neither is fine).
  - The copy says the neck is taught by name, position and sound either way, and that reading is extra.
  - `Settings.notation` is replaced by `reading: { reads: { tab, staff }, learn: { tab, staff } }` (booleans). Defaults are all false. `DEFAULT_SETTINGS` and the types change in `engine/model.ts`.
  - `getSettings` maps stored legacy values on read: `'tab'` → reads.tab, `'staff'` → reads.staff, `'none'` → nothing. There's no Dexie schema version, because settings is a single row. Unit-test the mapping and a round trip.
  - Design §3.6, §4, §5 (M-Reading row) and §12, plus research/03 Track R, describe the new rule:
    - Track R (staff) is promoted when the learner reads or wants to learn standard notation, or has the jazz or general goal.
    - The M9 tab track is promoted when they want to learn tab.
    - Staff ↔ fretboard and tab ↔ fretboard drills are on when the learner reads or is learning that notation.
    - Every reading track stays soft-unlocked and previewable for everyone.
  - RTL tests for the step (multi-select, both, neither, skip) and an e2e test (`@smoke`) on the onboarding flow.

### M1-24 · M1 milestone QA
- **Status:** done
- **Deps:** M1-01, M1-02, M1-03, M1-04, M1-05, M1-06, M1-07, M1-08, M1-09, M1-10, M1-11, M1-12, M1-13, M1-14, M1-15, M1-16, M1-17, M1-18, M1-19, M1-20, M1-22, M1-25, M1-26
- **Design:** §11 M1 definition of done
- **Owns:** `docs/progress.md`, `app/e2e/m1-24.spec.ts`
- **Acceptance:**
  - An end-to-end "first week" e2e test: onboarding → three daily sessions with a mocked clock → streak 3, a due-review session, and the heatmap updated.
  - A production screenshot pass on all profiles.
  - The M1 definition of done is checked off in `docs/progress.md`.

---

### M1-30 · Make streak repair visible on Today
- **Status:** done
- **Deps:** none
- **Design:** §3.7 (streak repair), §7 Today
- **Owns:** `app/src/screens/today/cards/streak-repair.tsx`, `app/src/screens/today/cards/streak-repair.module.css`, `app/src/screens/today/cards/streak-repair.test.tsx`, `app/e2e/m1-30.spec.ts`
- **Acceptance:**
  - From M1-24 QA: the engine repairs a broken streak after a double session within 48 hours (§3.7), but nothing tells the learner a repair is available, so the mechanic is invisible.
  - A Today card shows while a repair window is open (`streakRepairDeadline` in the future, `streakBeforeBreak` > 0), for example "Your 10-day streak broke. Practise 2× your goal by Tuesday to restore it." It shows progress towards the doubled goal and disappears once the streak is restored or the deadline passes.
  - Tone follows research/02 and §3.7: encouraging and loss-free, with no guilt copy. Reads the stored gamification state only; no engine changes.
  - RTL covers the open, in-progress, restored and expired states. E2E (`m1-30.spec.ts`, iPad projects; iPhone tagged `@smoke`) breaks a streak on a mocked clock, sees the card, does the double session and sees the streak restored.

### M1-31 · Fretboard contrast: light-theme inactive frets and nut string names
- **Status:** done
- **Deps:** none
- **Design:** §8 fretboard, research/02 (signalling)
- **Owns:** `app/src/components/fretboard/Fretboard.module.css`, `app/src/components/fretboard/Fretboard.tsx`, `app/src/components/fretboard/Fretboard.test.tsx`, `app/e2e/m1-31.spec.ts`
- **Acceptance:**
  - From M1-24 QA screenshots. In light theme, frets outside the active range (13–15 at regular-wide) get a pale grey wash, so they read as highlighted rather than dimmed, and their F/G markers are hard to read. The dark theme dims them correctly. Make light match dark in meaning: inactive frets recede.
  - The nut's string names (E B G D A E) have low contrast on the wood in both themes and are nearly invisible in light. Lift them to ≥4.5:1 against their actual background in both themes. Lighthouse misses this because axe skips SVG text, so assert it in a unit test (compute contrast from the tokens used) or an e2e pixel check.
  - Use tokens only (no new hard-coded colours). Keep the brand rules: no brand yellow on the neck, and `--root` for theory marks.
  - E2E (`m1-31.spec.ts`) screenshots the session neck in both themes on iPad landscape for review; existing Fretboard tests stay green.

### M1-32 · iPad portrait: the Progress mastery map clips its 12th fret
- **Status:** done
- **Deps:** none
- **Design:** §7 Progress, §7 size classes
- **Owns:** `app/src/components/heatmap/FretboardHeatmap.tsx`, `app/src/components/heatmap/Heatmap.module.css`, `app/src/components/heatmap/Heatmap.test.tsx`, `app/e2e/m1-32.spec.ts`
- **Acceptance:**
  - From M1-24 QA: on iPad portrait the mastery map cuts off its 12th fret column and the "12" label at the right edge.
  - Every fret column and label up to 12 is fully inside the panel on all iPad projects and iPhone, with no horizontal page scroll. Cells keep the §7 minimum size, or the map scrolls inside its own container with a visible affordance if they can't.
  - E2E (`m1-32.spec.ts`, all iPad projects; iPhone tagged `@smoke`): with seeded progress, the "12" label's bounding box lies inside the map's container and the viewport.

### M1-33 · Phone landscape: the session summary's Done is below the fold
- **Status:** done
- **Deps:** none
- **Design:** §7 session summary, §7 compact
- **Owns:** `app/src/session/summary/SessionSummary.tsx`, `app/src/session/summary/SessionSummary.module.css`, `app/src/session/summary/SessionSummary.test.tsx`, `app/e2e/m1-33.spec.ts`
- **Acceptance:**
  - From M1-24 QA (and the M1-20 vertical-layout note): on iPhone held sideways the session summary's **Done** link sits below the fold. The page scrolls, but the learner may not know to. M1-28 fixed Continue in-session but not the summary.
  - Done (and any primary action) is visible without scrolling on every supported viewport, including the shortest compact landscape. Prefer a compact summary layout at short heights over pinning, and respect `--safe-bottom`.
  - E2E (`m1-33.spec.ts`, iPhone tagged `@smoke`, plus iPad projects): finish a `focusSession` and assert that Done's bounding box lies inside the viewport with `window.scrollY` at 0.

### M1-34 · Learning vs stable: show progress before mastery
- **Status:** done
- **Deps:** none
- **Design:** §3.4, §3.7 mastery map, §7 Learn, research/02 rules 11 and 15
- **Owns:** `app/src/engine/progress.ts`, `app/src/engine/progress.test.ts`, `app/src/screens/learn/map-model.ts`, `app/src/screens/learn/map-model.test.ts`, `app/src/screens/learn/MasteryRing.tsx`, `app/src/screens/learn/Learn.module.css`, `app/src/screens/learn/LearnScreen.tsx`, `app/src/screens/learn/LearnScreen.test.tsx`, `app/src/screens/learn/ModuleDetail.tsx`, `app/src/screens/learn/SkillDetail.tsx`, `app/src/screens/learn/SkillDetail.test.tsx`, `app/e2e/m1-34.spec.ts`
- **Acceptance:**
  - User-reported (2026-10-18): after a 20-minute daily session and a 96% lesson, every Learn ring still read 0%. The ring only counts *stable* items (FSRS stability ≥ `mastery.stabilityDays`), and same-day reviews can't get there: a new card graded Good sits at ≈2.3 days however often it is repeated that day, and only a first-answer Easy (≈8.3 days) counts at once. That is correct, but it reads as broken and gives no visible competence (rule 15).
  - A pure `engine/progress.ts` defines **learning**: an item with a card whose most recent review was correct (not Again). It drops out again on a miss, so the count is honest rather than monotonic. Unit-tested, including lapses and seeded placement cards.
  - The map model carries `learningCount` and a 0–1 `learning` fraction next to `stableCount` and `mastery`, for skills and modules (item-weighted, as now).
  - The ring shows two layers: a light *learning* arc under the solid *stable* arc. They differ by shape as well as colour (e.g. thinner or hatched vs solid, design rule on markers), and use tokens only. Reduced motion is respected. A module's first session therefore lights its ring.
  - Copy uses **"Learning · Stable"**, not "learned", so one good session isn't presented as retained (illusion of competence, research/02). Skill meta reads e.g. "18 learning · 0 stable of 26". The spoken label covers both values, e.g. "Neck basics: 69% learning, 0% stable".
  - Mastery and unlocking are unchanged: they still depend on stable items and speed only (rule 7). This WP changes the display, not the gate.
  - RTL covers 0/0, learning-only, mixed and mastered rings. E2E (`m1-34.spec.ts`, iPad projects; iPhone tagged `@smoke`): finish a `focusSession`, open Learn, and see a non-zero learning value while stable stays 0.

### M1-35 · Session summary: tie today's score to learning and stable
- **Status:** done
- **Deps:** M1-34
- **After:** M1-33
- **Design:** §3.3 step 5, research/02 rules 11 and 15
- **Owns:** `app/src/session/summary/**`, `app/e2e/m1-35.spec.ts`
- **Acceptance:**
  - User-reported (2026-10-18): the session score (e.g. 96%), the Learn ring and mastery were read as one number, so a strong session followed by "0%" felt like progress wasn't being tracked.
  - The summary names the three separately: today's accuracy, items now *learning* (from `engine/progress.ts`), and items that became *stable*. Copy explains spacing in a line, e.g. "14 items learning. They become stable as you recall them over the next few days; your next review is Tuesday." The next-review date comes from the cards' due dates (a retention forecast, rule 15).
  - Encouraging and loss-free, consistent with §3.7 and the existing "come back tomorrow" copy. Respects M1-33's compact-landscape layout (Done stays above the fold).
  - RTL covers a first session (learning > 0, stable 0), a session that stabilises items, and an all-review session. E2E (`m1-35.spec.ts`, iPad projects; iPhone tagged `@smoke`) checks the learning count and next-review line after a `focusSession`.

### M1-36 · Developer-only "unlock every skill" switch
- **Status:** done
- **Deps:** none
- **Design:** §3.4
- **Owns:** `app/src/screens/settings/DeveloperTools.tsx`, `app/src/screens/settings/DeveloperTools.test.tsx`, `app/src/screens/settings/SettingsGroups.tsx`, `app/src/screens/learn/map-model.ts`, `app/e2e/m1-36.spec.ts`
- **Acceptance:**
  - User request (2026-10-18): the maintainer can't try Chords without about a week of real mastery of Intervals and Keys. Add a switch to try any module now.
  - It only exists in development builds (`import.meta.env.DEV`). It is tree-shaken out of production, and a test or bundle check proves the production build has no trace of it. It works on an iPad against `pnpm dev` over the LAN.
  - While on, every skill is treated as frontier, so "Practise this now" and sessions can use it. It is an overlay passed into status derivation (engine stays pure: no clock or storage reads). It **never writes** skill states, cards or review logs, and turning it off restores the real state exactly (tested).
  - A visible "Developer: all skills unlocked" badge shows while it's on, so screenshots and QA never mistake it for real progress.
  - E2E (`m1-36.spec.ts`, iPad landscape, dev server): toggle on, start a Chords focus session, toggle off, Chords is locked again.

### M1-37 · [hotfix] D39 "Fret landmarks", and a guard against empty lessons
- **Status:** done
- **Deps:** M1-34
- **Design:** §6 (drill catalogue), §7 Learn and session, research/02
- **Owns:** `app/src/drills/d39-fret-landmarks/`, `app/src/drills/registry.test.ts`, `app/src/screens/learn/LearnScreen.tsx`, `app/src/screens/learn/SkillDetail.tsx`, `app/src/screens/learn/SkillDetail.test.tsx`, `app/src/screens/learn/map-model.ts`, `app/src/screens/learn/map-model.test.ts`, `app/src/session/SessionScreen.tsx`, `app/src/session/SessionScreen.module.css`, `app/src/session/SessionScreen.test.tsx`, `app/e2e/m1-37.spec.ts`, `docs/design/app-design.md` (§6 row only)
- **Acceptance:**
  - User-reported bug (2026-10-18): "Fret markers 3, 5, 7, 9 and 12" (`F3.markers`) and `F3.repeat-12` open straight to "Session complete" with 0 items. Both skills name drill `fret-landmarks`, which was never designed, filed or built. `registry.test.ts`'s PENDING allowlist let it through because entries weren't tied to a WP.
  - **New drill D39 `fret-landmarks`** (`drills/d39-fret-landmarks/`): `marker:fN` (name the spotlit marker), `find-marker:fN` (tap it) and `repeat:±12@fN` (which fret has the same notes an octave away). Add a design §6 row.
  - **Prevention:** every PENDING entry in `drills/registry.test.ts` names a backlog WP that exists and isn't done, and a registered drill left in PENDING fails. Drills and skills must name each other.
  - **Guard:** Learn hides "Practise this now" for skills that no built drill can serve (`SkillView.practisable`, via the drill picker). The session screen shows "Nothing to practise right now" instead of finishing an empty session, and awards no XP or streak.
  - **Being built out of band** by another session (`guitar-nosync-f6`, branch `fix/f3-fret-landmarks`) and handed to the PM. It's `blocked` so the planner doesn't spawn a second worker on it. It gets a fresh review and goes through the lane like any WP. It overlaps M1-34 (Learn files) and M1-36 (`map-model.ts`): whoever lands second rebases.

## M2: Octaves and intervals

### M2-01 · [contract] Interval and octave theory
- **Status:** done
- **Deps:** —
- **Design:** §8, research/03 C1/C3
- **Owns:** `app/src/theory/intervals.ts`, `app/src/theory/intervals.test.ts`
- **Acceptance:**
  - `intervalBetween(posA, posB)` returns the interval name, and `positionForInterval(root, interval, string)` handles the G–B shift.
  - Interval shapes (m2–P8) are generated for every string pair.
  - Exhaustive tests. Exported from `theory/index.ts`, as an append-only edit.

### M2-02 · C1 octave skills
- **Status:** done
- **Deps:** M2-01
- **Owns:** `app/src/engine/skills/c1.ts`, `app/src/engine/skills/c1.test.ts`
- **Acceptance:**
  - Octave-shape skills include G–B shift variants. Items look like `octave:s6f5→s4`.
  - Prerequisites: F2 (soft).

### M2-03 · D4 "Octave finder" drill (multi-target)
- **Status:** done
- **Deps:** M2-02
- **Design:** §6 D4, §7 (iPad multi-target drills)
- **Owns:** `app/src/drills/d4-octave-finder/**`, `app/e2e/m2-03.spec.ts`
- **Acceptance:**
  - On iPad, "tap every G" works across the whole neck, with per-target feedback and timing graded on completion time.
  - On compact it runs region by region.

### M2-04 · C3 interval-shape skills
- **Status:** done
- **Deps:** M2-01
- **Owns:** `app/src/engine/skills/c3.ts`, `app/src/engine/skills/c3.test.ts`
- **Acceptance:**
  - Skills per interval group (3rds, 5ths, 7ths …) with G–B shift items. Prerequisites: F1 (and C1, softly).

### M2-05 · D5 "Name the interval from two dots"
- **Status:** done
- **Deps:** M2-04
- **Owns:** `app/src/drills/d5-interval-name/**`, `app/e2e/m2-05.spec.ts`
- **Acceptance:**
  - Choice drill. Distractors scale with the scope level. Answering plays both notes.
  - The context panel shows an interval legend that fades with the guide level.

### M2-06 · D6 "Tap the M3/P5/b7 from a root"
- **Status:** done
- **Deps:** M2-04
- **Owns:** `app/src/drills/d6-interval-tap/**`, `app/e2e/m2-06.spec.ts`
- **Acceptance:**
  - Tap drill. Any correct position in the active region is accepted. G–B shift items are interleaved deliberately.

### M2-07 · Worked-example framework, plus G–B shift content
- **Status:** done
- **Deps:** M1-16
- **Design:** §7 Learn (skill detail), research/02 rule 8
- **Owns:** `app/src/learn/worked-examples/**`, `app/src/screens/learn/SkillDetail.tsx`, `app/e2e/m2-07.spec.ts`
- **Acceptance:**
  - One file per skill (auto-registered) defines a 30-second interactive example that fades its guides: worked → faded → independent.
  - Includes G–B shift and octave examples, plus a misconception callout from research/03.
  - "Practise this now" starts a focused session.

### M2-08 · Learned confusion matrix
- **Status:** done
- **Deps:** M1-17
- **Design:** §3.3 step 3
- **Owns:** `app/src/engine/session.ts` (hotspot), `app/src/engine/confusions.ts`, `app/src/engine/confusions.test.ts`
- **Acceptance:**
  - Seed pairs (E/F, B/C, maj/min, C/A shapes) are merged with learned confusions, which decay over time.
  - Pairing places confusable items within 1–2 slots of each other without starving due reviews.
  - Tests cover the pairing guarantees.

### M2-09 · Placement test
- **Status:** done
- **Deps:** M1-06, M1-17
- **Design:** §3.4, §4 step 6
- **Owns:** `app/src/placement/**`, `app/src/onboarding/steps/placement.tsx`, `app/e2e/m2-09.spec.ts`
- **Acceptance:**
  - An adaptive probe of about 3 minutes covering F1, F2, C2 (C3, C5 and C8 once those skills exist; written to extend).
  - Known items are seeded at stability ≈ 10 days via `seedKnownCard`. The test is skippable.
  - The pure adaptive algorithm is unit-tested.

### M2-10 · Daily quests
- **Status:** done
- **Deps:** M1-10
- **Design:** §3.7 quests
- **Owns:** `app/src/engine/gamification/quests/**`, `app/src/screens/today/cards/quests.tsx`, `app/e2e/m2-10.spec.ts`
- **Acceptance:**
  - 3 rotating quests a day, drawn deterministically from the date, with one file per quest.
  - Quests nudge toward weak areas and interleaving (e.g. "10 fluent answers on strings 3–4").
  - Completion gives bonus XP and is logged.

### M2-11 · Focused sessions ("Practise this now", "Quiz me on this")
- **Status:** done
- **Deps:** M1-17
- **Owns:** `app/src/session/runner.ts` (hotspot), `app/src/session/focus.ts`, `app/e2e/m2-11.spec.ts`, `app/e2e/helpers/focus.ts`, `app/e2e/d1-session.spec.ts`, `app/e2e/smoke.spec.ts`
- **Acceptance:**
  - The runner accepts a skill or item filter. Focused sessions still use FSRS ordering and interleave within the focus.
  - The "Quiz me on this" buttons in Explore and Learn use it.

### M2-12 · Explore: fretboard explorer v2
- **Status:** done
- **Deps:** M1-01, M2-01
- **Design:** §7 Explore
- **Owns:** `app/src/screens/explore/views/fretboard-explorer.tsx`, `app/e2e/m2-12.spec.ts`
- **Acceptance:**
  - Pick a key, scale or chord, then toggle note names, degrees or intervals.
  - A chord view colours the root, 3rd, 5th and 7th across the neck (shape and colour), with "Quiz me on this" opening D37 for that chord once M3-14 exists.
  - Uses the whole neck on iPad, plus "Quiz me on this".

### M2-13 · Per-user FSRS parameter refit
- **Status:** done
- **Deps:** M1-17
- **Design:** research/02 rule 1
- **Owns:** `app/src/engine/refit.ts`, `app/src/engine/refit.test.ts`, `app/src/engine/scheduler.ts`
- **Acceptance:**
  - After about 1,000 reviews, FSRS parameters are refit from the local review log (ts-fsrs optimiser or a documented fallback).
  - Parameters persist in settings, and the scheduler uses them. Behaviour is unchanged below the threshold (tested).

### M2-15 · Retake the placement test from Settings
- **Status:** done
- **Deps:** M2-09
- **Design:** §3.4, §4 step 6
- **Owns:** `app/src/routes/placement.route.tsx`, `app/src/placement/**`, `app/src/screens/settings/SettingsGroups.tsx`, `app/src/screens/settings/SettingsGroups.test.tsx`, `app/e2e/m2-15.spec.ts`
- **Acceptance:**
  - User-reported (2026-10-18): the placement test runs only during onboarding. A learner who skipped it, or took it before C3 and C5 existed, can never use it again, so an experienced player has to grind through gates they could test past.
  - Settings offers "Retake the placement test". It opens the same adaptive test full-screen and probes every topic in `placement.topics` that now has skills.
  - Re-taking is safe. `save.ts` already never re-seeds an item with real history; keep that guarantee and test it: a retake never lowers a skill's status, guide level or any card.
  - Copy explains what it does ("skips material you already know") and that it can't make you lose progress.
  - E2E (`m2-15.spec.ts`, iPad projects; iPhone tagged `@smoke`): skip placement in onboarding, retake it from Settings, answer fluently, and see the probed skills unlocked or mastered in Learn.

### M2-16 · "Test out" of a locked module
- **Status:** done
- **Deps:** M2-09
- **After:** M2-15, M1-34
- **Design:** §3.4, research/02 rule 7
- **Owns:** `app/src/placement/**`, `app/src/engine/config/placement.ts`, `app/src/screens/learn/ModuleDetail.tsx`, `app/src/screens/learn/Learn.module.css`, `app/e2e/m2-16.spec.ts`
- **Acceptance:**
  - User-reported (2026-10-18): Chords needs Intervals and Keys mastered first. That gate is rule 7 and stays, but rule 7 gates on *mastery*, not time served. An experienced player should be able to prove mastery and skip a week of waiting. This is where they hit the wall, so the offer belongs there.
  - A locked module's detail offers "Already know this? Test out". It runs the placement algorithm scoped to the unmet prerequisites of that module's first skills (for Chords: the C3 and C4 skills `C5.triads` needs). Results are saved through the existing placement save path, so known items are seeded via `seedKnownCard` and probes are logged as placement reviews (rule 17).
  - **It must actually open the module.** Today `save.ts` marks a known skill mastered only when every probed item has a card and the mastery rule holds, otherwise practising. Practising is not enough for hard prerequisites (`C5.triads` has no `softUnlock`). Also, `placement.topics` doesn't include C4 (keys), so placement can never unlock Chords today. Fix both: probe enough items to justify mastery, or seed the whole skill once its probes are fluent. Add C4 to the probed topics. A unit test shows that a fluent test-out of Chords' prerequisites unlocks `C5.triads`.
  - A failed or partial test-out never lowers anything. It says what was found, e.g. "Intervals: known. Keys: let's practise those first", and the passed parts still unlock what they can.
  - E2E (`m2-16.spec.ts`, iPad projects; iPhone tagged `@smoke`): from a fresh profile, test out of Chords' prerequisites fluently, then start a Chords focus session.

### M2-14 · M2 milestone QA
- **Status:** done
- **Deps:** M2-01, M2-02, M2-03, M2-04, M2-05, M2-06, M2-07, M2-08, M2-09, M2-10, M2-11, M2-12, M2-13
- **Owns:** `docs/progress.md`, `app/e2e/m2-14.spec.ts`
- **Acceptance:**
  - A cross-drill e2e test, a production screenshot pass, and a progress update.

---

### M2-17 · Interleave near-tie due reviews
- **Status:** done
- **Deps:** none
- **Design:** §3.3 session builder, research/02 rule 6 (interleave)
- **Owns:** `app/src/engine/session.ts` (hotspot), `app/src/engine/session.test.ts`
- **Acceptance:**
  - From M2-14 QA: due reviews with near-equal due times are ordered by item ID, so a placement-seeded batch serves one skill's items back to back instead of interleaving them (rule 6).
  - Break near-ties (within a configurable window in `engine/config/`) by round-robin over skill, then drill, or with a shuffle from the session `rng`. Keep it deterministic for a given `rng`. Overdue order still wins outside the window.
  - Unit tests: a seeded batch from three skills interleaves, the same rng gives the same order, and an item that is clearly more overdue still comes first.

### M2-18 · Per-drill context panels, starting with D4 octave shapes
- **Status:** done
- **Deps:** none
- **Design:** §6 (drill plugin interface), §7 session context panel
- **Owns:** `app/src/drills/types.ts` (contract hub: additive optional field only), `app/src/session/SessionScreen.tsx` (hotspot: the aside only), `app/src/drills/d4-octave-finder/ContextPanel.tsx`, `app/src/drills/d4-octave-finder/ContextPanel.module.css`, `app/src/drills/d4-octave-finder/ContextPanel.test.tsx`, `app/e2e/m2-18.spec.ts`
- **Acceptance:**
  - From M2-14 QA: the session's context panel is hard-coded to "Musical alphabet" in `SessionScreen.tsx`, so D4 shows note-name help instead of octave shapes.
  - Add an optional `contextPanel` component to the drill plugin. `SessionScreen` renders it when the current drill provides one and falls back to the alphabet panel otherwise. No other drill changes.
  - D4's panel shows the octave shapes: +2 frets and 2 strings over, +3 across the G–B pair, and the double octave. Draw them with shape as well as colour, follow guide fading, and keep it accessible.
  - E2E (`m2-18.spec.ts`, iPad projects): a D4 focus session shows the octave panel; a D1 session still shows the alphabet.

### M2-19 · Progress shows interval and octave work
- **Status:** done
- **Deps:** none
- **Design:** §7 Progress
- **Owns:** `app/src/screens/progress/panels/stats.tsx`, `app/src/screens/progress/panels/topics.tsx`, `app/src/screens/progress/panels/topics.test.tsx`, `app/src/screens/progress/panels/topics.module.css`, `app/e2e/m2-19.spec.ts`
- **Acceptance:**
  - From M2-14 QA: Progress shows nothing for M2 work. The mastery map is notes-only, and the "Notes in rotation" tile also counts octave and interval cards.
  - Rename the tile to "Items in rotation". Add a per-topic panel (registered through the Progress panel registry): for each started topic, learning and stable counts using M1-34's definitions, with no illusion-of-competence wording.
  - E2E (`m2-19.spec.ts`): after seeded C1 and C3 reviews, the topic panel lists Octaves and Intervals with non-zero counts.

### M2-20 · iPad portrait: D5/D6 layout polish
- **Status:** done
- **Deps:** none
- **Design:** §7 layout system
- **Owns:** `app/src/drills/d5-interval-name/D5View.module.css`, `app/src/drills/d6-interval-tap/D6View.module.css`, `app/e2e/m2-20.spec.ts`
- **Acceptance:**
  - From M2-14 QA: on iPad portrait, D5 and D6 centre the neck in a tall empty band, with the help panel pinned at the bottom.
  - Lay out prompt, neck, answers and help as one column that uses the height sensibly. Neck cells stay ≥44pt, with no horizontal overflow. Other size classes are unchanged.
  - E2E (`m2-20.spec.ts`, ipad-portrait): the gap between prompt and neck is under a set fraction of the viewport, and the answer controls are in view without scrolling.

### M1-39 · Dev unlock reaches Explore's "Quiz me", and document LAN testing
- **Status:** done
- **Deps:** none
- **Design:** §3.4, §7 Explore
- **Owns:** `app/src/screens/explore/views/fretboard-explorer.tsx`, `app/src/screens/explore/views/fretboard-explorer.test.tsx`, `README.md` (development section only)
- **Acceptance:**
  - From the M1-36 review: Explore's "Quiz me on this" checks the frontier without the dev "unlock every skill" overlay, so with the switch on it still refuses locked skills. Pass the overlay into that check, as Learn and sessions do. With the switch off, behaviour is unchanged (tested both ways).
  - README: document trying the app on an iPad against the dev server (`pnpm dev --host`, the LAN URL, the dev-only unlock switch in Settings), next to the existing preview instructions.

### M1-38 · Copy polish: Learn prerequisites and summary tiles
- **Status:** done
- **Deps:** none
- **Design:** §7 Learn, §7 session summary
- **Owns:** `app/src/screens/learn/SkillDetail.tsx`, `app/src/screens/learn/SkillDetail.test.tsx`, `app/src/session/summary/SessionSummary.tsx`, `app/src/session/summary/SessionSummary.test.tsx`
- **Acceptance:**
  - From M2-14 QA. A locked skill's prerequisite list runs together ("Half steps: sharps and flats and Whole steps and Octave shapes"). Use a list (one per line) or commas with a final "and".
  - The summary's "Learning 7 · Became stable 7" tiles can read as 14 items. Make clear that "Became stable" is a subset of today's items (e.g. "7 of them became stable"), keeping M1-35's learning/stable split.
  - RTL covers both.

### M2-21 · Move every drill's help panel onto `contextPanel`
- **Status:** done
- **Deps:** none
- **Design:** §6 (drill plugin interface), §7 session context panel
- **Owns:** `app/src/drills/d3-note-wheel/`, `app/src/drills/d5-interval-name/`, `app/src/drills/d6-interval-tap/`, `app/src/drills/d7-spell-it/`, `app/src/drills/d39-fret-landmarks/` (their view, panel and CSS files only), `app/e2e/m2-21.spec.ts`
- **Acceptance:**
  - From the M2-18 review: D3, D5, D6, D7 and D39 still build their own context `<aside>`, so the panel wrapper exists in six places. Move each to the optional `contextPanel` plugin field that M2-18 added, and delete the per-drill wrappers. Behaviour, guide fading and accessibility are unchanged.
  - Every panel fits the space above the neck on iPad mini landscape (about 190px) with no overflow.
  - E2E (`m2-21.spec.ts`, iPad projects): each of these drills shows its panel inside the session's context region, with no horizontal overflow. Existing drill specs stay green.

### M1-40 · iPad portrait: D1-family layout, and an intervals seeding helper
- **Status:** done
- **Deps:** none
- **Design:** §7 layout system
- **Owns:** `app/src/drills/d1-name-the-note/D1View.module.css`, `app/src/drills/d2-find-the-note/D2View.module.css`, `app/e2e/helpers/intervals.ts`, `app/e2e/m2-20.spec.ts`, `app/e2e/m1-40.spec.ts`
- **Acceptance:**
  - From the M2-20 review: D1 and the drills that copied D1's `.drill { justify-content: space-between }` probably leave a tall empty band on iPad portrait, as D5/D6 did. Confirm with a gap assertion; if it's there, apply M2-20's fix (`.drill[data-size-class='regular'] { justify-content: flex-start }`, and `> .context { align-self: stretch }` where help sits below the neck). Other size classes are unchanged, and neck cells stay ≥44pt.
  - Give `seedIntervals` an optional `practising: [{ skillId, guideLevel }]` and export `THIRDS_SHAPES`, then make `m2-20.spec.ts` use them instead of its copied seeder.
  - E2E (`m1-40.spec.ts`, ipad-portrait): the D1 and D2 prompt-to-neck gap is under the same bound m2-20 uses.

## M3: Chords and CAGED

### M3-01 · [contract] Scale, chord and CAGED theory v2
- **Status:** done
- **Deps:** —
- **Owns:** `app/src/theory/chords.ts`, `app/src/theory/scales.ts`, `app/src/theory/shapes.ts`, `app/src/theory/*.test.ts`
- **Acceptance:**
  - Major-scale degrees and key spelling, plus chord spelling (triads, maj7/7/m7/m7b5, sus, add9) via tonal.
  - Minor and dominant-7 CAGED templates, and triad cores of each CAGED shape.
  - Exhaustive tests.

### M3-02 · C4 skills plus D7 "Spell it"
- **Status:** done
- **Deps:** M3-01
- **Owns:** `app/src/engine/skills/c4.ts`, `app/src/drills/d7-spell-it/**`, `app/e2e/m3-02.spec.ts`
- **Acceptance:**
  - Ordered-choice spelling of keys and chords. Enharmonic spelling is enforced, with a clear explanation when it's wrong.

### M3-03 · C5 chord-construction skills
- **Status:** done
- **Deps:** M3-01
- **Owns:** `app/src/engine/skills/c5.ts`, `app/src/engine/skills/c5.test.ts`
- **Acceptance:**
  - Skills run triads → 7ths → sus/add. Prerequisites: C3 and C4. The "7 vs maj7" misconception gets confusable pairing.

### M3-04 · D8 "Find the chord tone in a shape"
- **Status:** done
- **Deps:** M3-03, M3-05
- **Owns:** `app/src/drills/d8-chord-tone/**`, `app/e2e/m3-04.spec.ts`
- **Acceptance:**
  - Tap the 3rd or b7 inside a displayed shape. The shape outline follows the guide level.
  - User request (2026-10-18): identifying the **root** comes first, then the 3rd, 5th and 7th. Prompts cover every chord tone ("tap the root", "tap the 5th"), not only the 3rd and b7.
  - Both directions (rule 12): "tap the 3rd in this shape" and "this highlighted note: root, 3rd, 5th or 7th?". Pair the 3rd/b3 and b7/7 confusions (rule 6).
  - Shapes include the common open and barre voicings as well as the CAGED shapes, at varied roots and positions.

### M3-05 · C6 CAGED skills plus D9 "Build the shape at a root"
- **Status:** done
- **Deps:** M3-01
- **Owns:** `app/src/engine/skills/c6.ts`, `app/src/drills/d9-build-caged/**`, `app/e2e/m3-05.spec.ts`
- **Acceptance:**
  - Partial shapes and triad cores come first (research/03). The learner taps the template at a given root.
  - The whole neck is shown on iPad, with C vs A shape confusable pairing.

### M3-06 · D10 "Which shape, and which comes next?"
- **Status:** done
- **Deps:** M3-05
- **Owns:** `app/src/drills/d10-which-shape/**`, `app/e2e/m3-06.spec.ts`
- **Acceptance:**
  - A choice drill that varies keys and positions (rule 12).

### M3-07 · Chord-diagram component (chart view)
- **Status:** done
- **Deps:** —
- **Design:** §8 chart view
- **Owns:** `app/src/components/chord-diagram/**`
- **Acceptance:**
  - A vertical SVG chord diagram that shares the fretboard styling: barres, fingerings, root highlighting.
  - Unit and RTL tests.

### M3-08 · Explore: CAGED visualiser
- **Status:** done
- **Deps:** M1-01, M3-01
- **Owns:** `app/src/screens/explore/views/caged.tsx`, `app/e2e/m3-08.spec.ts`
- **Acceptance:**
  - Pick a chord to see an animated chain of the 5 shapes, with triad cores highlighted. Respects reduced motion. Includes "Quiz me on this".

### M3-09 · Explore: chord finder
- **Status:** done
- **Deps:** M1-01, M3-07, M3-16
- **Owns:** `app/src/screens/explore/views/chord-finder.tsx`, `app/src/screens/explore/views/chord-finder.meta.ts`, `app/e2e/m3-09.spec.ts`
- **Acceptance:**
  - Tap notes to name the chord (`Chord.detect`). Type a symbol to see voicings. The chords-db licence (MIT) is checked before adding it.

### M3-10 · Worked examples for C4–C6
- **Status:** done
- **Deps:** M2-07, M3-01
- **Owns:** `app/src/learn/worked-examples/c4-*.tsx`, `app/src/learn/worked-examples/c5-*.tsx`, `app/src/learn/worked-examples/c6-*.tsx`
- **Acceptance:**
  - Examples plus misconception callouts ("CAGED is a map, not 5 grips").
  - A "find the root first" example: locate the root in a shape, then read the 3rd to tell major from minor (supports D8 and D36).

### M3-11 · Session context-panel registry
- **Status:** done
- **Deps:** M3-07
- **Design:** §7 session context panel
- **Owns:** `app/src/session/SessionScreen.tsx` (hotspot), `app/src/drills/d7-spell-it/ContextPanel*`, `app/src/drills/d8-chord-tone/ContextPanel*`, `app/src/drills/d9-build-caged/ContextPanel*`, `app/e2e/m3-11.spec.ts`
- **Acceptance:**
  - *Scope note (2026-10-19): M2-18 added the drill plugin's optional `contextPanel`, and M2-21 moved D3, D5, D6, D7 and D39 onto it. Build on that, with no second registry.*
  - Drills declare their context panels: key and diatonic chords (D7), current chord diagram (D8), CAGED chain mini-map (D9; never while D10 serves), interval legend (done in D5).
  - The panel content follows guide fading and is hidden at level 0.

### M3-13 · D36 "What chord is this?"
- **Status:** done
- **Deps:** M3-03, M3-04, M3-05, M3-18
- **Design:** §6 D36, research/03 C5 ("name the chord from its dots")
- **Owns:** `app/src/drills/d36-name-the-chord/**`, `app/src/engine/skills/c5-name.ts`, `app/e2e/m3-13.spec.ts`
- **Acceptance:**
  - User request (2026-10-18). A chord voicing is shown on the neck (as a chord diagram as well, once M3-07 exists) and the learner names it: root, then quality (major, minor, 7, maj7, m7, m7b5, sus).
  - The voicings are common open, barre and CAGED shapes at varied roots and positions (rule 12). The answer is never printed on the prompt (M1-25).
  - Items are atomic and FSRS-scheduled (rule 1). Decide and record the item grain in design §6: e.g. one card per quality × shape family, with the root varied per prompt. Major/minor and 7/maj7 are confusable pairs (rule 6).
  - Wrong-answer feedback labels each dot with its degree (R, 3, 5, 7) by shape and colour, and says which note decided the quality ("the 3rd is C, a minor 3rd above A").
  - Unit tests for the item model and grading, plus an e2e test on the iPad projects with the happy path tagged `@smoke`.

### M3-14 · D37 "Chord tones across the neck" (multi-target)
- **Status:** done
- **Deps:** M3-03, M2-03, M3-18
- **Design:** §6 D37, §7 (iPad multi-target drills), research/03 C7/I2
- **Owns:** `app/src/drills/d37-chord-tones-neck/**`, `app/src/engine/skills/c5-tones.ts`, `app/e2e/m3-14.spec.ts`
- **Acceptance:**
  - User request (2026-10-18): "highlight all notes in a C chord". The prompt names a chord ("tap every note of C major"), or one degree of it ("tap every 3rd of C major"), in a region, then across the whole neck on iPad.
  - Reuse D4's multi-target machinery (M2-03): per-target feedback, completion-time grading, region by region on compact.
  - Feedback marks each found note with its degree (R, 3, 5, 7), by shape as well as colour. Missed and wrong taps are shown after the attempt.
  - Feeds I2 (chord tones inside a box) and CAGED: the region option can align with a CAGED shape's span.
  - Unit tests for target sets and grading, plus an e2e test on the iPad projects.

### M3-15 · D38 "Build the chord" (tap a voicing)
- **Status:** done
- **Deps:** M3-03, M3-04, M3-18
- **Design:** §6 D38, research/03 C5 ("build a chord by tapping")
- **Owns:** `app/src/drills/d38-build-the-chord/**`, `app/e2e/m3-15.spec.ts`
- **Acceptance:**
  - Given a symbol and a starting root on the neck ("Am7, root on string 5 fret 0"), the learner taps one note per string to make a playable voicing.
  - Any voicing that contains the required chord tones, within a playable span (≤4 frets, configurable in `engine/config/<area>.ts`), is accepted. Feedback names each tapped note's degree and flags missing tones.
  - The reverse direction of D36, so the same facts are practised both ways (rule 12).
  - Unit tests for voicing validation, plus an e2e test on the iPad projects.

### M3-16 · Lazy-load the Explore views (first-load budget)
- **Status:** done
- **Deps:** none
- **Design:** §10 non-functional (first-load JS ≤ 250 KB gzip)
- **Owns:** `app/src/screens/explore/registry.ts`, `app/src/screens/explore/ExploreScreen.tsx`, `app/src/screens/explore/ExploreScreen.test.tsx`, `app/e2e/m3-16.spec.ts`
- **Acceptance:**
  - From the M3-08 review: first-load JS is about 245.5 KB of the 250 KB budget, because `explore/registry.ts` globs every view with `eager: true`. Keep each view's metadata (`title`, `order`) available up front, but load each view's component with `React.lazy`/dynamic import on demand, with an accessible loading state. Explore views must not count towards first-load JS.
  - `scripts/check-bundle.mjs` shows a measurable drop (record before/after in the report). Explore still works offline after the first load (precache covers the lazy chunks).
  - E2E (`m3-16.spec.ts`): each Explore view opens and renders, online and offline after a first load.

### M3-17 · Chord tones in stages: root, then 3rd, 5th and 7th
- **Status:** done
- **Deps:** none
- **Design:** §3.1, §3.4, research/02 rule 7, research/03 C5
- **Owns:** `app/src/engine/skills/c5-chord-tones.ts`, `app/src/engine/skills/c5-chord-tones.test.ts`, `app/src/engine/config/placement.ts` (`skipSkills` entries only), `app/src/drills/d8-chord-tone/` (only if the item IDs it reads change), `app/e2e/m3-17.spec.ts`
- **Acceptance:**
  - User request (chord lessons, 2026-10-18): "find the root first, then the 3rd, 5th and 7th". M3-04's worker proposed it. Split `C5.tones-triads` into stages (root, then 3rd, then 5th) and `C5.tones-sevenths` into its 7th stage, each gated on mastery of the one before (soft unlock as the other C-skills do).
  - Existing learners keep their D8 cards: map or migrate the old item IDs so no progress is lost (tested).
  - Add the new skill IDs to `ENGINE_CONFIG.placement.skipSkills` so onboarding placement stays within budget.
  - Unit tests for gating and migration; e2e: a fresh learner is first served root-finding items, and 3rd items unlock after the root stage is mastered.

### M2-22 · D5 at its widest scope fits above the neck on iPad mini
- **Status:** done
- **Deps:** M2-21
- **Design:** §7 layout system, research/02 rule 9 (guide fading)
- **Owns:** `app/src/drills/d5-interval-name/`, `app/e2e/helpers/wide-intervals.ts`, `app/e2e/m2-21.spec.ts`
- **Acceptance:**
  - From the M2-21 review. At 12 choices and guide level 3 on iPad mini landscape, the D5 panel is about 362px and the prompt column about 211px, against about 196px of room above a neck that clears the feedback bar. This predates M2-21.
  - Starting design (worker's option A): at more than 4 choices, single-line legend rows (`M3 major 3rd · 4`, with "half steps" kept for screen readers), a panel of about 32rem, answer buttons in rows of 6, and drop the redundant level-3 "count half steps" tip at that scope while keeping the G–B tip. Check the tip removal against rule 9 and record it in the report. Keep ✓/✗ and the dashed or solid borders (shape as well as colour).
  - Remove the `test.fixme` from "D5 at its widest scope still fits above the neck on iPad mini" (`app/e2e/m2-21.spec.ts`) and make it pass.

### M1-41 · D39's neck clears the feedback bar on iPad mini
- **Status:** done
- **Deps:** M2-21
- **Design:** §7 layout system, §8 fretboard
- **Owns:** `app/src/drills/d39-fret-landmarks/D39View.tsx`, `app/src/drills/d39-fret-landmarks/D39View.module.css`, `app/e2e/m2-21.spec.ts` (the D39 `clearsBar` flag only)
- **Acceptance:**
  - From the M2-21 review: D39's 0–12 neck on iPad mini landscape is 468px tall and ends under the pinned feedback bar (about 59px of page scroll).
  - Size the neck so it clears the bar on every iPad project without scrolling, keeping cells ≥44pt. Flip `clearsBar: true` for D39 in `m2-21.spec.ts` and make it pass.


### M1-42 · [contract] Keep drill logic out of first-load JS
- **Status:** done
- **Priority:** high (first-load JS is at about 240 of 250 KB, and every new drill adds 2–3 KB)
- **Deps:** none
- **Design:** §6, §10 (first-load budget)
- **Owns:** `app/src/drills/registry.ts`, `app/src/drills/types.ts`, `app/src/drills/lazy-view.tsx`, `app/src/drills/registry.test.ts`, `app/src/drills/lazy-view.test.tsx`, `app/src/session/runner.ts` (only for awaiting drill logic), `app/e2e/m1-42.spec.ts`
- **Acceptance:**
  - Found by the PM, 2026-10-19: M3-18 made drill views lazy, but each `drill.ts` still imports its `logic.ts` (prompt building, grading, choices) statically, and the registry loads every `drill.ts` eagerly. First-load JS grew from 232 to about 240 KB in one day of drills.
  - Split each plugin into eager metadata (id, skills, item kinds, scope levels, `requiresMic`, …) and lazily loaded logic, following the M3-18 pattern for views (`lazyParts`). The session planner and runner work from metadata, and await a drill's logic chunk (preloaded with its view) before its first prompt.
  - Migrate every existing drill (D1–D13 and D36–D40, plus any landed by then). `drills/lazy-view.test.tsx` (or a sibling test) fails if a `drill.ts` statically imports its `logic.ts`, so new drills can't regress.
  - `check-bundle` shows first-load JS down by at least the drills' logic, and the report gives before and after numbers. **Restore `BUDGET_KB` in `scripts/check-bundle.mjs` to 250.** It was raised to 280 temporarily on 2026-10-20 (user decision; see progress.md "Decisions and deviations"). No change in behaviour: the full e2e suite passes unchanged.
  - Coordinate through the PM with drills in flight: they rebase onto the new contract.

### M1-43 · [contract] One file per item kind, so drills stop colliding in engine/model.ts
- **Status:** done
- **Priority:** high (every drill package now conflicts with every other in engine/model.ts, and each conflict costs a rebase plus a full verify)
- **Deps:** none
- **Design:** §6, CLAUDE.md "add things by adding files"
- **Owns:** `app/src/engine/model.ts`, `app/src/engine/model.test.ts`, `app/src/engine/items/**`, `app/src/engine/skills/registry.test.ts`, `app/src/engine/config/placement.ts`, `app/e2e/m1-43.spec.ts` (only if needed)
- **Acceptance:**
  - Found by the PM, 2026-10-19: each new drill appends its item kind in the same five places in `engine/model.ts` (the `ItemRef` union, a regex, `itemId`, `parseItemId`, and a case). M3-14, M3-15, M4-02, M4-03 and M4-04 all hit rebase conflicts there within hours, and so did `skills/registry.test.ts` (a hand-ordered list) and `config/placement.ts` (`skipSkills`).
  - Item kinds register by file: `engine/items/<kind>.ts` exports the kind's id/parse pair (and type), and `model.ts` auto-collects them (an `import.meta.glob` registry, as for skills and drills) while keeping the `ItemRef` type and the `itemId`/`parseItemId` API. Migrate every existing kind. Stored item IDs don't change (a round-trip test over all kinds).
  - Make the other two append points file-local: the skills-order test derives its expectations from the skill files instead of a hand-kept list, and placement skips come from a field on each skill rather than a central `skipSkills` array. Behaviour doesn't change.
  - Document in CLAUDE.md "Conventions": a new item kind means a new file in `engine/items/`.
  - Coordinate through the PM: drills in flight rebase onto it once (their kinds move into files), and after that they stop colliding.
### M1-44 · [contract] Win back first-load JS headroom for the next drills
- **Status:** done
- **Priority:** high (main is at 249.0 of 250 KB; M6-06 measures 251.9 KB, and every drill in flight adds 1–3 KB of eager metadata)
- **Deps:** none
- **Design:** §6, §10 (first-load budget)
- **Owns:** `app/vite.config.ts`, `scripts/check-bundle.mjs`, `app/src/engine/model.ts` (only how item kinds are collected), `app/src/engine/skills/index.ts` (only how skills are collected), `app/src/theory/index.ts`, `app/e2e/m1-44.spec.ts`
- **Acceptance:**
  - Found by the PM, 2026-10-20, from M6-06's preflight: after M1-42 the eager cost of a drill package is its `meta.ts`/`drill.ts`, its skill file, its `engine/items/<family>.ts`, and any `theory/*` function that its lazy logic uses. That last one lands on first load because the whole `theory` chunk is eager. M6-06 added 2.9 KB: items +0.8, skills/meta +0.5, theory +0.6 (`secondaryDominants`, `tritoneSubstitute`, unused on first load), plus D8's voicing table split into its own eager chunk (+0.9).
  - Keep theory code that only lazy drill logic uses out of first-load JS (for example: stop forcing all of `src/theory/**` into one eager chunk, so each lazy chunk pulls what it uses), and fix chunking so moved code like the voicing table doesn't come back as a new eager chunk.
  - Measure before and after on main and on `wp/M6-06` (in the report). Target: at least 8 KB of headroom under 250 KB on main, so the next few drills fit. If item-kind or skill collection is the larger cost, make it lazier without changing behaviour (the planner and placement still see every skill).
  - `BUDGET_KB` stays 250. No behaviour change: the full e2e suite passes unchanged.
  - Coordinate through the PM: drills over budget (M6-06 first) rebase onto it and re-run `pnpm verify:quick --preflight`.

### M3-18 · Lazy-load drill views and the onboarding and placement routes
- **Status:** done
- **Deps:** M3-16
- **Design:** §10 non-functional (first-load JS ≤ 250 KB gzip), §6 drill plugin interface
- **Owns:** `app/src/drills/registry.ts` (hotspot), `app/src/drills/types.ts` (contract hub: additive only), `app/src/session/SessionScreen.tsx` (hotspot: Suspense around the drill view only), `app/src/routes/registry.ts` (hotspot), `app/src/routes/onboarding.route.tsx`, `app/src/routes/placement.route.tsx`, `app/e2e/m3-18.spec.ts`
- **Acceptance:**
  - From M3-16's measurement. After lazy Explore, first-load JS is about 244 KB of 250 KB, and every new drill adds 2.4–3.7 KB, so the budget is nearly gone. The next-largest app contributors are drill views (about 11.8 KB: `drills/registry.ts` globs every `drill.ts` with `eager: true`, and each plugin imports its view) and the onboarding and placement routes (about 9.8 KB, eager route glob).
  - Keep each drill plugin's pure logic and metadata eager (the session planner needs it), but load each drill's `View` component on demand, with Suspense in `SessionScreen` and an accessible loading state. No drill behaviour changes.
  - Make the onboarding and placement routes lazy route elements. They run once per learner.
  - The session must not stall: prefetch the next drill's view chunk while the current prompt is on screen, so a drill switch never shows a spinner on a normal connection. Everything works offline after the first load (the precache covers the chunks).
  - Record before and after first-load sizes. Target: at least 15 KB freed.
  - E2E (`m3-18.spec.ts`): a multi-drill session switches drills without visible loading after the first prompt; onboarding and placement still work offline after a first load. Existing specs stay green.

### M3-12 · M3 milestone QA
- **Status:** done
- **Deps:** M3-01, M3-02, M3-03, M3-04, M3-05, M3-06, M3-07, M3-08, M3-09, M3-10, M3-11, M3-13, M3-14, M3-15
- **Owns:** `docs/progress.md`, `app/e2e/m3-12.spec.ts`
- **Acceptance:**
  - A production screenshot pass and a progress update.

---

## M4: Harmony, progressions and ear

### M4-01 · [contract] Harmony theory
- **Status:** done
- **Deps:** —
- **Owns:** `app/src/theory/harmony.ts`, `app/src/theory/harmony.test.ts`
- **Acceptance:**
  - Diatonic chords per key, Roman and Nashville numerals, a progression catalogue (research/03 C9, including rotations), capo and transposition maths, and the circle of fifths.

### M4-02 · C8 skills plus D11 "Roman numeral ↔ chord"
- **Status:** done
- **Deps:** M4-01
- **Owns:** `app/src/engine/skills/c8.ts`, `app/src/drills/d11-numerals/**`, `app/e2e/m4-02.spec.ts`

### M4-03 · C9 skills plus D12 "Progression builder"
- **Status:** done
- **Deps:** M4-01
- **Owns:** `app/src/engine/skills/c9.ts`, `app/src/drills/d12-progression-builder/**`, `app/e2e/m4-03.spec.ts`
- **Acceptance:**
  - Drag chords into slots and transpose. Pointer and keyboard drag both work on iPad. The rotation misconception gets pairing.

### M4-04 · C10 skills plus D13 "Capo calculator"
- **Status:** done
- **Deps:** M4-01
- **Owns:** `app/src/engine/skills/c10.ts`, `app/src/drills/d13-capo/**`, `app/e2e/m4-04.spec.ts`

### M4-05 · I3 skills, D40 "Key-signature cards" and an interactive circle of fifths
- **Status:** done
- **Deps:** M4-01, M1-01
- **Design:** §6, §Explore, research/03 I3
- **Owns:** `app/src/engine/skills/i3.ts`, `app/src/drills/d40-key-signature/**`, `app/src/screens/explore/views/circle-of-fifths.*`, `app/e2e/m4-05.spec.ts`, plus a D40 row in design §6
- **Acceptance:**
  - User decision (2026-10-19): I3 gets its own small choice drill now, instead of waiting for M8's D25. **D40 "Key-signature cards"** has item kinds for how many sharps or flats a key has (and which), which major key has a given signature, the relative minor, and the V. It follows the M3-18 lazy-view contract.
  - I3 skills in `engine/skills/i3.ts` point at D40. The interactive circle of fifths (built on M4-01's helpers) is an Explore view whose "Quiz me on this" focuses I3.
  - Choices must not give the answer away (see M4-02's review: no structure a learner can exploit without knowing the key). Unit tests for item generation and grading. E2E: the circle's Quiz button starts a D40 session.

### M4-06 · Audio engine v2
- **Status:** done
- **Deps:** —
- **Design:** §9
- **Owns:** `app/src/audio/**`
- **Acceptance:**
  - A plucked or sampled guitar tone, chord strums, and progression scheduling on the Tone Transport.
  - Volume and silent mode. It stays lazily loaded and inside the budget.

### M4-07 · I6 ear skills plus D14 "Hear it → identify"
- **Status:** done
- **Deps:** M4-01, M4-06
- **Owns:** `app/src/engine/skills/i6.ts`, `app/src/drills/d14-ear-identify/**`, `app/e2e/m4-07.spec.ts`

### M4-08 · D15 "Hear it → find it on the neck"
- **Status:** done
- **Deps:** M4-06, M1-04
- **Owns:** `app/src/drills/d15-ear-find/**`, `app/e2e/m4-08.spec.ts`

### M4-09 · Explore: progression player
- **Status:** done
- **Deps:** M4-01, M4-06, M1-01
- **Owns:** `app/src/screens/explore/views/progression-player.tsx`, `app/src/screens/explore/views/progression-player.meta.ts`, `app/e2e/m4-09.spec.ts`

### M4-10 · "Ear only" quick drill and "start with sound" path
- **Status:** done
- **Deps:** M4-07, M1-18, M1-06
- **Owns:** `app/src/screens/today/cards/ear-only.tsx`, `app/src/onboarding/steps/start-with-sound.tsx`

### M4-11 · M4 milestone QA
- **Status:** todo
- **Deps:** M4-01, M4-02, M4-03, M4-04, M4-05, M4-06, M4-07, M4-08, M4-09, M4-10
- **Owns:** `docs/progress.md`, `app/e2e/m4-11.spec.ts`

### M4-12 · Tools section: nav entry, tool registry and index
- **Status:** done
- **Priority:** high (user request, 2026-10-19: prioritise the path to the tuner)
- **Deps:** none
- **Design:** §Navigation, §Tools, §7
- **Owns:** `app/src/routes/tools.route.tsx`, `app/src/screens/tools/ToolsScreen.tsx`, `app/src/screens/tools/ToolsScreen.module.css`, `app/src/screens/tools/registry.ts`, `app/src/screens/tools/*.test.ts*`, `app/e2e/m4-12.spec.ts`
- **Acceptance:**
  - User request (2026-10-19): a **Tools** section for practice utilities, starting with a tuner (M5-03) and a metronome (M8-20). It is a sixth nav section, ordered between Explore and Progress, in the iPad sidebar and the compact tab bar. Every tab stays ≥44pt at 375pt width.
  - Tools are auto-registered, one folder per tool (`app/src/screens/tools/<tool>/tool.meta.ts` plus a lazily loaded view, following the M3-18 lazy pattern). Adding a tool means adding a folder. Routes are `/tools` (the index) and `/tools/<tool>`.
  - The section stays out of the nav until at least one tool is registered, so this package can land first without showing an empty screen. Test it with a fake tool.
  - The index is a regular-wide-first grid of tool cards (name, one-line purpose, icon), which degrades to a list on compact. There's no first-load JS cost beyond the route stub (`check-bundle` stays under budget).
  - RTL tests for the registry and the index. E2E: with a test-only tool registered, the section appears in the nav and opens the tool.

---

### M4-13 · Fix: silent audio on iPhone and iPad since the plucked guitar
- **Status:** done
- **Priority:** high (user report, 2026-10-20: "Play a test note" and other sounds stopped on the user's iPhone and iPad after M4-06)
- **Deps:** none
- **Design:** §9
- **Owns:** `app/src/audio/**`, `app/e2e/m4-06.spec.ts`, `app/e2e/m4-13.spec.ts`, `app/e2e/helpers/audio.ts`
- **Acceptance:**
  - User report (2026-10-20): since audio engine v2 (M4-06) shipped, nothing sounds on the user's real iPhone and iPad (Safari and the installed PWA) when they tap Settings → Sound → "Play a test note". It worked before M4-06.
  - PM diagnosis, to confirm or refute first: before M4-06 the voice was `Tone.PolySynth(Tone.Synth)`, which uses native oscillators only. M4-06's `voice.ts` uses `Tone.PluckSynth`, whose `LowpassCombFilter` → `FeedbackCombFilter` is an **AudioWorklet** that Tone loads with `audioWorklet.addModule(URL.createObjectURL(blob))` (`tone/build/esm/core/worklet/ToneAudioWorklet.js`). WebKit sometimes refuses that blob: the lane's iPad-mini WebKit run logged a pageerror `"…ttp://127.0.0.1:4310/<uuid> due to access control checks."` (the blob URL, truncated). If the worklet never loads, the pluck is silent. Two other suspects to check: the service worker intercepting the blob or the worklet fetch, and the very first tap calling `Tone.start()` after an `await import('tone')`, outside the gesture (see `unlockAudio` in `audio.ts`).
  - Fix it so that iOS and iPadOS Safari play every sound: the test note, single notes, strums and progressions. The guitar should still sound plucked (design §9). The preferred route needs no AudioWorklet and no blob URL: for example, Karplus–Strong rendered in pure TS into `AudioBuffer`s per note (cached), played through `AudioBufferSourceNode` or `Tone.Player`/`Sampler`, or a native-node voice. Put the pure synthesis in a tested module. Keep Tone lazy and first-load under budget.
  - If a worklet ever fails to load, the app must still make sound (a native fallback voice), never stay silent.
  - Also make the first-ever tap reliably unlock audio on iOS: resume or create the context synchronously inside the gesture, not after the dynamic import resolves.
  - Remove the blob "access control checks" filter that 81dd35e added to `app/e2e/m4-06.spec.ts`: once nothing loads a blob worklet, that error is a real failure again. Add a WebKit e2e test (all iPad profiles plus `@smoke` for iPhone) that plays the test note and asserts output level > 0 with **no** pageerrors, with the service worker active (as in production).
  - Report what you confirmed as the root cause. The user tests on real devices after the ship.

## M5: Mic mode

### M5-01 · [contract] Pitch-input API
- **Status:** done
- **Deps:** —
- **Design:** §9 input
- **Owns:** `app/src/mic/types.ts`, `app/src/mic/index.ts`
- **Acceptance:**
  - A `PitchSource` interface ({frequency, clarity} stream, stable-note events ≥80ms, start/stop on a user gesture) and a fake source for tests.

### M5-02 · AudioWorklet pitch detector (pitchy)
- **Status:** done
- **Priority:** high (user request, 2026-10-19: prioritise the path to the tuner)
- **Deps:** M5-01
- **Owns:** `app/src/mic/worklet/**`, `app/src/mic/detector.ts`, `app/src/mic/*.test.ts`
- **Acceptance:**
  - Synthetic-signal tests for accuracy and octave errors. Permission is requested only when the learner enables mic mode.

### M5-03 · Tools: tuner
- **Status:** done
- **Priority:** high (user request, 2026-10-19: prioritise the path to the tuner)
- **Deps:** M5-02, M4-12
- **Design:** §Tools, §9
- **Owns:** `app/src/screens/tools/tuner/**`, `app/e2e/m5-03.spec.ts`
- **Acceptance:**
  - A tool in the Tools section (user request, 2026-10-19). It shows a needle and cents readout (in tune within ±5 cents), the detected note, and the nearest string in standard tuning, using the M5-02 detector. The mic is requested only when the learner opens the tuner and taps to start. It explains the problem if permission is denied.
  - Reference tones: tap a string (E A D G B E) to hear its pitch, so the tuner is useful without a mic.
  - It doubles as the mic check (§9): a clear "mic is working" state the M5-04 onboarding can link to.
  - Large iPad layout. Colour isn't the only in-tune signal (a shape or label changes too), and the needle respects `prefers-reduced-motion`.
  - Unit tests for cents and string mapping. E2E with a fake pitch source.

### M5-04 · Mic onboarding and settings
- **Status:** done
- **Deps:** M5-02, M1-06
- **Owns:** `app/src/onboarding/steps/mic.tsx`, `app/src/screens/progress/panels/mic.tsx`

### M5-05 · D16 "Play the note"
- **Status:** done
- **Deps:** M5-01
- **Design:** §6 mic constraint
- **Owns:** `app/src/drills/d16-play-note/**`, `app/e2e/m5-05.spec.ts`
- **Acceptance:**
  - Modes: any position, region-restricted, or pitch class only. E2E uses the fake pitch source.

### M5-06 · D17 "Play the interval, arpeggio or scale"
- **Status:** done
- **Deps:** M5-01
- **Owns:** `app/src/drills/d17-play-sequence/**`, `app/e2e/m5-06.spec.ts`

### M5-07 · Mic quests and achievements
- **Status:** done
- **Deps:** M2-10, M1-13, M5-05
- **Owns:** `app/src/engine/gamification/quests/try-mic.ts`, `app/src/engine/gamification/achievements/mic-*.ts`

### M5-08 · M5 milestone QA
- **Status:** done
- **Deps:** M5-01, M5-02, M5-03, M5-04, M5-05, M5-06, M5-07
- **Owns:** `docs/progress.md`

---

## M6: Intermediate

### M6-01 · [contract] Intermediate theory
- **Status:** done
- **Deps:** M3-01
- **Owns:** `app/src/theory/pentatonic.ts`, `app/src/theory/arpeggios.ts`, `app/src/theory/function.ts`, `app/src/theory/*.test.ts`
- **Acceptance:**
  - Pentatonic boxes ↔ CAGED, arpeggio shapes, 5-position major scale, minor harmony (harmonic-minor V) and chord function / substitutions.

### M6-02 · C7 pentatonic skills and box-overlay drill
- **Status:** done
- **Deps:** M6-01
- **Owns:** `app/src/engine/skills/c7.ts`, `app/src/drills/d-pentatonic-box/**`

### M6-03 · I1 skills plus D18 "Triad inversions on a string set"
- **Status:** done
- **Deps:** M6-01
- **Owns:** `app/src/engine/skills/i1.ts`, `app/src/drills/d18-inversions/**`

### M6-04 · D19 "Voice-leading puzzle"
- **Status:** done
- **Deps:** M6-03
- **Owns:** `app/src/drills/d19-voice-leading/**`

### M6-05 · I2 arpeggio skills (reusing D8)
- **Status:** done
- **Deps:** M6-01, M3-04
- **Owns:** `app/src/engine/skills/i2.ts`

### M6-06 · I4 and I5 minor-harmony and function skills, plus choice drills
- **Status:** done
- **Deps:** M6-01, M4-01
- **Owns:** `app/src/engine/skills/i4.ts`, `app/src/engine/skills/i5.ts`, `app/src/drills/d-function/**`

### M6-07 · I7 major scale in 5 positions
- **Status:** done
- **Deps:** M6-01
- **Owns:** `app/src/engine/skills/i7.ts`, `app/src/drills/d-pentatonic-box/**`, `app/src/engine/items/scale-position.ts`, `app/src/engine/items/scale-position.test.ts`, `app/e2e/m6-07.spec.ts` (widened by the PM, 2026-10-20: no other drill could serve I7 cards)

### M6-08 · F4 rhythm track plus D20 "Tap and strum rhythm"
- **Status:** done
- **Deps:** M4-06, M8-01
- **Owns:** `app/src/engine/skills/f4.ts`, `app/src/drills/d20-rhythm/**`, `app/e2e/m6-08.spec.ts`
- **Acceptance:**
  - Builds on the shared M8-01 timing engine (metronome, tap/mic onsets, latency calibration, `gradeTiming`). Don't build a separate metronome.
  - D20 covers tap and strum timing against a click (±30 ms target, configurable).

### M6-09 · D21 "Visualise it" (mental practice)
- **Status:** done
- **Deps:** M3-05
- **Owns:** `app/src/drills/d21-visualise/**`

### M6-10 · M6 milestone QA
- **Status:** done
- **Deps:** M6-01, M6-02, M6-03, M6-04, M6-05, M6-06, M6-07, M6-08, M6-09
- **Owns:** `docs/progress.md`

### M6-11 · Degree shapes and labelled targets in guided prompts and worked examples
- **Status:** todo
- **Note:** fix first among the M6 follow-ups (M6 QA findings 1 and 2: design §8 "shape as well as colour")
- **Deps:** M6-10
- **Design:** §8 markers; research/02 rules 8 and 10; `docs/progress.md` "M6 definition of done" findings 1 and 2
- **Owns:** `app/src/drills/d8-chord-tone/**`, `app/src/drills/d18-inversions/**`, `app/src/drills/d19-voice-leading/**`, `app/src/drills/d-pentatonic-box/**`, `app/e2e/m6-11.spec.ts`
- **Acceptance:**
  - D8's guided prompt markers use each tone's degree shape (`d8DegreeStyle`), matching the context panel's legend; degrees and letter names are never mixed on one neck.
  - The `target` treatment (ring, emphasis) is added on top of the degree shape, never instead of it: D18's 5th is a triangle before it's tapped, I7 (`ScaleView.tsx`) draws 3rds and 5ths with their shapes as C7 does, D19's root is the root square.
  - Every worked-example target carries a label: C7's box targets (`BoxView.tsx:109`), the relative-minor "Tap each F" targets (labelled F), D19's targets (`D19View.tsx:133`). The prompt says how many to tap, and the count matches.
  - I7's worked-example hint names the notes to tap (the ringed 4ths and 7ths), not "the dots are major box 1".
  - Unit tests on each view's marker builder (shape per degree, label on every target); an e2e check on one worked example per drill.

### M6-12 · D20 grid: equal beat cells, Start under the prompt, readable late marks
- **Status:** todo
- **Deps:** M6-10
- **Design:** §6 D20; `docs/progress.md` "M6 definition of done" finding 3
- **Owns:** `app/src/drills/d20-rhythm/**`, `app/e2e/m6-12.spec.ts`
- **Acceptance:**
  - Every grid cell is the same size; beat grouping is shown without shrinking boxes (box size reads as accent in a rhythm drill).
  - Start sits under the prompt column and is above the fold on a sideways phone.
  - Feedback marks where the click was and shows early/late with a glyph that doesn't read as a play button.

### M6-13 · D21 becomes optional mental practice, with clearer feedback
- **Status:** todo
- **Note:** research/02 rule 14
- **Deps:** M6-10
- **Design:** §6 D21; research/02 rules 12 and 14; `docs/progress.md` "M6 definition of done" "For the PM" and finding 6
- **Owns:** `app/src/drills/d21-visualise/**`, `app/src/drills/types.ts` `mental`, `app/src/session/drill-picker.ts`, `app/src/screens/settings/SettingsGroups.tsx`, `app/src/screens/settings/SettingsGroups.test.tsx`, `app/e2e/m6-13.spec.ts`
- **Acceptance:**
  - PM decision (2026-10-21, rule 14): a "Mental practice" setting, on by default (D21 adds a context for the same fact, rule 12), that the learner can switch off. Drill meta gets a `mental` flag, read in `drill-picker.ts` the way `requiresMic` and `requiresSound` are. With it off, D21 never takes a turn and nothing gates on it.
  - D21's feedback draws the missed root as the root square at full strength, found roots turn green as in the pentatonic-box drill, and the explanation names the note ("You tapped G♯") instead of a string and fret the blank neck doesn't show. Flat keys spell with flats (B♭, not A♯).
  - Unit tests for the picker with the setting on and off; e2e: switch it off, and a C6 whole-shape session never serves D21.

### M6-14 · M6 drill polish: D18 portrait window, function-drill repeats, small layout points
- **Status:** todo
- **Deps:** M6-10
- **Design:** `docs/progress.md` "M6 definition of done" findings 4, 5 and 9
- **Owns:** `app/src/drills/d-function/**`, `app/src/screens/progress/ProgressScreen.tsx`, `app/e2e/m6-14.spec.ts`
- **After:** M6-11
- **Acceptance:**
  - D18 in iPad portrait shows 12 frets with the nut and string names, like the other portrait drills; the portrait neck drills (C7, D18, D19, D21) don't float in a tall empty band (finding 4). D18, D19 and pentatonic-box view CSS is M6-11's: do this after it ships and widen Owns then.
  - The function drill doesn't repeat its guided fact in feedback, the prompt doesn't still say "Tap E to continue" after answering, and the I5 panel states the function roles once (finding 5). PM decision: the "IV in C major" cue line stays (the card tests numeral → function).
  - Finding 9: no needless scroll on iPad landscape and mini for the relative-minor, I7 and D19 prompts; I7's open-string markers don't cover the nut names; Progress's achievement toast doesn't cover the h1, and fret ranges use a non-breaking dash.

---

## M7: Accounts and sync (deferred)

Filed from user feedback (2026-10-18): "allow people to enter an email address to save progress. Login should be optional. To log in, it should email you a link, or a code; both should work. If a user already has progress but no login, it should be transferred to the server so that multiple devices stay in sync." **Unblocked 2026-10-18 (evening):** the user approved the `FretworkSync` stack (Cognito, HTTP API with Lambda, DynamoDB). The email sender is decided (see M7-02), and the `/privacy` page exists for M7-06 to extend. Design §1 principle 8 still holds: everything works without an account, offline, on one device.

Notes for whoever picks this up:
- **An installed iPad PWA doesn't open email links.** Tapping a magic link opens Safari, which has separate storage from the home-screen app. So the emailed **code** is the primary path in the installed app. The link signs in the browser it opens in. Every email carries both.
- **Merge by design, not last-writer-wins on everything.** Review logs and XP events are append-only, so the union is keyed by ID. FSRS cards can be replayed from logs, or merged with per-card `updatedAt`. Settings use per-field last-writer-wins. Streaks and stats are derived.
- The scope is accounts and sync. The rest of design §11's M7 (Capacitor build, Web Push reminders, opt-in leagues) builds on this and isn't filed yet.

### M7-01 · [contract] Sync model and merge rules (pure)
- **Status:** done
- **Deps:** —
- **Design:** §1 (principle 8), §11 M7
- **Owns:** `app/src/storage/sync/model.ts`, `app/src/storage/sync/merge.ts`, `app/src/storage/sync/*.test.ts`, `app/src/storage/db.ts` (hotspot: new schema version for IDs, `updatedAt`, tombstones and an outbox)
- **Acceptance:**
  - Every syncable table (cards, review logs, settings, gamification tables) has a stable ID, `updatedAt` and tombstones. A Dexie schema version is appended, never edited.
  - Pure merge functions for each table follow the rules above. They're property-tested: merging is commutative, associative and idempotent, and no review log is ever lost.
  - Document the sync protocol (push and pull with a server cursor) in `docs/design/sync.md`.

### M7-02 · Infra: passwordless auth and sync API stack
- **Status:** done
- **Deps:** M7-01
- **Owns:** `infra/lib/sync-stack.ts`, `infra/bin/app.ts`, `infra/test/sync-stack.test.ts`, `scripts/deploy.sh`
- **Acceptance:**
  - A separate CDK stack (`FretworkSync`, us-east-1). It has a Cognito user pool with passwordless email sign-in, where one email carries both a magic link and a 6-digit code: single use, about 15-minute expiry, a few attempts, rate-limited. It also has SES sending from an approved address, an HTTP API with a JWT authoriser, Lambda, and a DynamoDB table partitioned by user.
  - No account IDs, ARNs or zone IDs in git. Domain and sender come from config with env overrides (`scripts/lib.sh`).
  - **Email is already provisioned by the separate `FretworkEmail` stack** (`infra/lib/email-stack.ts`, deployed with `scripts/deploy-email.sh`, decided 2026-10-18). Don't create SES identities or email DNS records here.
    - Sender: `no-reply@fretfree.app`, display name **"Fret Free"**. The product is being rebranded, so email copy must never hardcode "Fretwork".
    - Config in `scripts/lib.sh`: `EMAIL_REGION` (**eu-west-1**, where the account has SES production access), `EMAIL_DOMAIN`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_CONFIG_SET` (`fretwork-email`, a fixed name) and `EMAIL_SSM_PREFIX`.
    - FretworkSync stays in us-east-1 and **must not use the SSM lookup**: those parameters live in eu-west-1, and the lookup is same-region only. Build the identity ARN with `Stack.formatArn({ service: 'ses', region: EMAIL_REGION, resource: 'identity', resourceName: EMAIL_DOMAIN })`.
    - Wire Cognito with `UserPoolEmail.withSES({ fromEmail, fromName, sesRegion: EMAIL_REGION, configurationSetName: EMAIL_CONFIG_SET, sesVerifiedDomain: EMAIL_DOMAIN })`. In the same account Cognito sends through its service-linked role, so no identity policy is needed.
    - SES production access is granted in eu-west-1 (50k/day). E2E tests still must not depend on real delivery.
  - CDK assertion tests. `pnpm ship` deploys both stacks, and smoke checks the API's health route.

### M7-03 · Sync API handlers
- **Status:** done
- **Deps:** M7-01, M7-02
- **Owns:** `infra/lambda/sync/**`
- **Acceptance:**
  - `push` (a batch of changed records) and `pull` (changes since a cursor) per authenticated user. A user can only reach their own data, with a test for it. Batches are size-limited and idempotent.
  - The handlers reuse M7-01's merge functions. Unit tests run against a local DynamoDB fake.
  - `DELETE /account` removes all of the user's server data and the Cognito user.

### M7-04 · "Save your progress": optional email sign-in UI
- **Status:** done
- **Deps:** M7-02
- **Owns:** `app/src/account/**`, `app/src/routes/account.route.tsx`, `app/src/screens/progress/panels/account.tsx`, `app/e2e/m7-04.spec.ts`
- **Acceptance:**
  - Optional, and never a gate: a Progress panel (and a gentle Today card after a few sessions) offers "Save your progress across devices". The learner enters an email and gets "check your email". Then they either type the 6-digit code in the app or tap the link, which lands on `/account/verify`.
  - Copy explains that the code is the way to sign in to the installed iPad app. Errors cover expired, used and wrong codes. Sign-out keeps the local data.
  - iPad-first layout, a11y (Lighthouse 100), and no analytics. An e2e test runs against a mocked auth endpoint.

### M7-05 · Client sync engine, including uploading existing progress
- **Status:** blocked
- **Deps:** M7-01, M7-03, M7-04
- **Owns:** `app/src/storage/sync/engine.ts`, `app/src/storage/sync/engine.test.ts`, `app/e2e/m7-05.spec.ts`
- **Acceptance:**
  - On first sign-in, all existing local progress is pushed to the server. Nothing is lost if the server already holds another device's data: it merges.
  - After that, sync runs on app start, focus, reconnect and after each session, from a Dexie outbox. Everything stays offline-first, and the UI never waits on the network.
  - Two-device tests against a fake server: diverged offline progress on both devices converges to the same state after sync, review logs are complete, and streaks and stats match.
  - A sync status line (last synced, offline, error) in the account panel.
  - From the 2026-10-20 review's verification: M10-02 and M10-12 move rows to new skill IDs with a schema migration (the `storage/migrations/c5-tone-stages.ts` pattern). Rows pulled from a device on an older schema are restaged the same way before they are merged.

### M7-06 · Account management and privacy
- **Status:** todo
- **Deps:** M7-04, M7-05
- **Owns:** `app/src/screens/progress/panels/account-manage.tsx`, `app/src/routes/about.route.tsx`, `docs/design/app-design.md`, `app/e2e/m7-06.spec.ts`
- **Acceptance:**
  - Delete account removes the server data (M7-03) and keeps or clears local data as the learner chooses. Export still works signed in or not.
  - The About and privacy copy explain what's stored (email, progress), where (AWS us-east-1), and why. There's still no analytics.
  - Design §1 principle 8 and §2 (Backend) are updated to describe optional sync.

### M7-07 · M7 milestone QA
- **Status:** todo
- **Deps:** M7-01, M7-02, M7-03, M7-04, M7-05, M7-06
- **Owns:** `docs/progress.md`, `app/e2e/m7-07.spec.ts`
- **Acceptance:**
  - An end-to-end test in production with two browser contexts: sign in by code on one and by link on the other, practise offline on both, reconnect, and see identical progress.
  - Abuse checks: code brute-force limits, email rate limits, cross-user access denied.

---

## M8: Reading and meter (future)

Design §12, research/03 Tracks R and T, drills D22–D32.

**Scheduling.** These are future packages, so most carry `After: M6-10`. That's a **soft** ordering: by default the planner schedules them after M1–M6. When slots would otherwise be idle and all their real `Deps` are `done`, the orchestrator may pull them forward (`backlog.mjs plan` does this automatically in its second pass).

**Shared timing engine.** M8-01 is the single timing engine (metronome, onsets, latency calibration, timing grade). The M6 rhythm track (M6-08, F4/D20) builds on it, so M8-01 has no `After` and is scheduled as soon as M4-06 lands.

Every M8 view follows the iPad landscape rule: **the staff sits above the neck, both visible at once** (§12 Screens).

### M8-01 · [contract] Timing engine: metronome, onsets, latency calibration and timing grade
- **Status:** done
- **Deps:** M4-06
- **Design:** §12 timing engine, §9, §3.2
- **Owns:** `app/src/timing/**`, `app/e2e/m8-01.spec.ts`
- **Acceptance:**
  - A metronome on the Tone.js Transport with per-meter accent patterns (simple, compound, and odd groupings such as 3+2 or 2+2+3), tempo changes, count-in, and the ability to drop beats (the fade-the-click API used by D31).
  - Tap onset capture (pointer and key) on the audio clock, plus an `OnsetSource` interface with a mic implementation (energy/spectral-flux onset detection in an AudioWorklet, reusing the M5 mic plumbing once it exists) and a fake source for tests.
  - Latency compensation: `AudioContext.outputLatency` plus a tap-to-click calibration (about 10 s). The result is stored in settings and applied to every onset.
  - A pure `gradeTiming(offsetsMs, cfg)` maps "on time within ±30–50 ms" (configurable in `engine/config/<area>.ts`) to Again/Hard/Good/Easy, consistent with design §3.2.
  - Pure logic has ≥90% unit coverage, and the onset detector is tested on synthetic signals. Shared with M6-08 (F4/D20). Document the API in a header comment.

### M8-02 · [contract] Notation renderer (VexFlow)
- **Status:** done
- **Deps:** —
- **After:** M6-10
- **Design:** §12 rendering
- **Owns:** `app/src/components/staff/**`, `app/e2e/m8-02.spec.ts`, `package.json` / `app/package.json` / `pnpm-lock.yaml` (adds `vexflow`, MIT; hotspot)
- **Acceptance:**
  - A `<Staff>` component on VexFlow covering:
    - treble clef 8vb (guitar), key and time signatures;
    - notes and rests (including dotted values, ties, beams and tuplets), accidentals and ledger lines;
    - an optional `TabStave` under the staff, shown at higher guide levels and fading away.
  - Hit-testing returns the staff position for a tap (lines, spaces and ledger positions, ≥44pt targets), which D24 needs. Notes can be highlighted and flashed like the fretboard markers.
  - Lazily loaded: VexFlow stays out of the first-load budget (M1-19). Dark and light themes use the tokens. VoiceOver labels name each note.
  - RTL tests for rendering and hit-testing; e2e on the iPad profiles.

### M8-03 · [contract] Staff theory (pure)
- **Status:** done
- **Deps:** —
- **After:** M6-10
- **Owns:** `app/src/theory/staff.ts`, `app/src/theory/staff.test.ts`
- **Acceptance:**
  - Pitch ↔ staff position for treble 8vb, including the ledger-line count (low E = 3 below).
  - Applying a key signature to an unaltered note, and the spelling of accidentals in context.
  - Position reading: in a given position (open, 5th, 7th, 9th, 12th), each staff pitch maps to exactly one string and fret.
  - Exhaustive tests. Exported from `theory/index.ts` as an append-only edit.

### M8-04 · [contract] Meter and rhythm theory (pure)
- **Status:** todo
- **Deps:** —
- **After:** M6-10
- **Owns:** `app/src/theory/meter.ts`, `app/src/theory/rhythm.ts`, `app/src/theory/meter.test.ts`, `app/src/theory/rhythm.test.ts`
- **Acceptance:**
  - Time signatures: simple vs compound, felt beats (6/8 = 2), beat unit, cut time, and odd-meter groupings.
  - Note and rest values with dots, ties and tuplets, bar-fill validation, and beaming groups per meter.
  - A rhythm-cell catalogue (`rhythm:dotted-8th-16th`, …) and onset-time expansion at a tempo, consumed by M8-01 grading and the drills.

### M8-05 · T1 and T2 skills, plus D32 "Simple or compound? How many felt beats?"
- **Status:** todo
- **Deps:** M8-04
- **After:** M6-10
- **Owns:** `app/src/engine/skills/t1.ts`, `app/src/engine/skills/t2.ts`, `app/src/drills/d32-simple-compound/**`, `app/e2e/m8-05.spec.ts`
- **Acceptance:**
  - Items look like `meter:6/8:feltBeats` and cover both directions.
  - 6/8 vs 3/4 confusable pairing. Choice drill with keyboard answers.

### M8-06 · D29 "Complete the bar"
- **Status:** todo
- **Deps:** M8-02, M8-04, M8-05
- **After:** M6-10
- **Owns:** `app/src/drills/d29-complete-the-bar/**`, `app/e2e/m8-06.spec.ts`
- **Acceptance:**
  - Drag or tap note values to fill a bar in the given time signature. Pointer and keyboard paths both work on iPad. Wrong fills are explained ("6/8 groups in dotted quarters").

### M8-07 · T4 and T7 skills, plus D30 "Hear the meter"
- **Status:** todo
- **Deps:** M8-01, M8-04
- **After:** M6-10
- **Owns:** `app/src/engine/skills/t4.ts`, `app/src/engine/skills/t7.ts`, `app/src/drills/d30-hear-the-meter/**`, `app/e2e/m8-07.spec.ts`
- **Acceptance:**
  - Generated strummed or drummed clips: 3/4, 4/4, 6/8 and 12/8 first, then 5/4 and 7/8 (T7).
  - Sound before symbol: answers are meter names first, with notation shown only after answering. Confusable pairing for 6/8 vs 3/4 and 12/8 vs 4/4 shuffle.

### M8-08 · T3 and T5 skills, plus D31 "Accent and strum in meter"
- **Status:** todo
- **Deps:** M8-01, M8-04
- **After:** M6-10
- **Owns:** `app/src/engine/skills/t3.ts`, `app/src/engine/skills/t5.ts`, `app/src/drills/d31-accent-strum/**`, `app/e2e/m8-08.spec.ts`
- **Acceptance:**
  - Tap or strum with the correct accents against the click. The **click fades out** (drops beats) as accuracy improves, to build internal pulse (guidance hypothesis).
  - Timing is graded by `gradeTiming`. Counting syllables are shown at high guide levels ("1 e & a", "1 la li").

### M8-09 · R1 skills, plus D22 "Name the note on the staff"
- **Status:** todo
- **Deps:** M8-02, M8-03
- **After:** M6-10
- **Owns:** `app/src/engine/skills/r1.ts`, `app/src/drills/d22-staff-name/**`, `app/e2e/m8-09.spec.ts`
- **Acceptance:**
  - Items look like `staff:E4@treble8vb`, both directions, with ±3 ledger lines. Adjacent line/space confusable pairing.
  - The target is under 2 s. Keyboard answers A–G.

### M8-10 · R2 skills, plus D23 "Staff → fretboard by position"
- **Status:** todo
- **Deps:** M8-02, M8-03, M1-04
- **After:** M6-10
- **Owns:** `app/src/engine/skills/r2.ts`, `app/src/drills/d23-staff-to-fret/**`, `app/e2e/m8-10.spec.ts`
- **Acceptance:**
  - Items look like `staff→fret:G3@pos5`. Open position first, then the 5th, 7th, 9th and 12th.
  - On iPad landscape the staff sits above the full neck, with the active position region shown and everything outside it dimmed.

### M8-11 · D24 "Fretboard → staff"
- **Status:** todo
- **Deps:** M8-09
- **After:** M6-10
- **Owns:** `app/src/drills/d24-fret-to-staff/**`, `app/e2e/m8-11.spec.ts`
- **Acceptance:**
  - A highlighted fret; the learner taps the staff position, using M8-02 hit-testing. Wrong answers show both positions and play both notes.

### M8-12 · R3 skills, plus D25 "Read the key signature and apply it"
- **Status:** todo
- **Deps:** M8-03, M8-02, M4-01
- **After:** M6-10
- **Owns:** `app/src/engine/skills/r3.ts`, `app/src/drills/d25-key-signature/**`, `app/e2e/m8-12.spec.ts`

### M8-13 · R4 rhythm-cell skills, plus D27 "Rhythm reading"
- **Status:** todo
- **Deps:** M8-01, M8-02, M8-04
- **After:** M6-10
- **Owns:** `app/src/engine/skills/r4.ts`, `app/src/drills/d27-rhythm-reading/**`, `app/e2e/m8-13.spec.ts`
- **Acceptance:**
  - Tap the written rhythm against a click, with mic onsets optional. Sound before symbol: hear the cell first on its first exposure.
  - Dotted vs straight confusable pairing. Graded with `gradeTiming`.

### M8-14 · D28 "Rhythm dictation"
- **Status:** todo
- **Deps:** M8-13
- **After:** M6-10
- **Owns:** `app/src/drills/d28-rhythm-dictation/**`, `app/e2e/m8-14.spec.ts`
- **Acceptance:**
  - Hear a bar, then pick or build its notation from known rhythm cells.

### M8-15 · R5 intervallic and pattern-reading skills, plus drill
- **Status:** todo
- **Deps:** M8-09, M2-01
- **After:** M6-10
- **Owns:** `app/src/engine/skills/r5.ts`, `app/src/drills/d-staff-intervals/**`, `app/e2e/m8-15.spec.ts`
- **Acceptance:**
  - Name the step or skip between adjacent staff notes (target under 1.5 s), building read-ahead chunks. Introduced early in Track R (§12 pedagogy).

### M8-16 · D26 "Sight-read" (mic)
- **Status:** todo
- **Deps:** M8-10, M8-13, M5-02
- **After:** M6-10
- **Owns:** `app/src/drills/d26-sight-read/**`, `app/src/notation/passage-generator.ts`, `app/src/notation/passage-generator.test.ts`, `app/e2e/m8-16.spec.ts`
- **Acceptance:**
  - Generates unlimited fresh 4–8-bar passages from the learner's known notes, position and rhythm cells, so they never memorise a piece (Kopiez & Lee).
  - The passage scrolls at an adaptive tempo, and the learner keeps going through errors. Graded on ≥90% correct notes (mic, position-unique pitches).
  - E2E uses the fake pitch source.

### M8-17 · R7 "Tab ↔ staff" and position choice
- **Status:** todo
- **Deps:** M8-10
- **After:** M6-10
- **Owns:** `app/src/engine/skills/r7.ts`, `app/src/drills/d-tab-staff/**`, `app/e2e/m8-17.spec.ts`

### M8-18 · T6 pickups, repeats and endings
- **Status:** todo
- **Deps:** M8-02, M8-04
- **After:** M6-10
- **Owns:** `app/src/engine/skills/t6.ts`, `app/src/drills/d-form-reading/**`, `app/e2e/m8-18.spec.ts`
- **Acceptance:**
  - Find bar 1 of a pickup melody, and follow repeat signs and first/second endings. Choice and tap drills.

### M8-19 · Explore: notation viewer
- **Status:** todo
- **Deps:** M8-02, M8-03, M1-01
- **After:** M6-10
- **Owns:** `app/src/screens/explore/views/notation-viewer.tsx`, `app/src/screens/explore/views/notation-viewer.meta.ts`, `app/e2e/m8-19.spec.ts`
- **Acceptance:**
  - Tap a note on the staff to see it on the neck, and vice versa. Staff above neck on iPad. Includes "Quiz me on this".

### M8-20 · Tools: metronome
- **Status:** done
- **Deps:** M8-01, M4-12
- **Owns:** `app/src/screens/tools/metronome/**`, `app/e2e/m8-20.spec.ts`
- **Acceptance:**
  - A tool in the Tools section (user request, 2026-10-19, which also lifts its old `After: M6-10` so it ships once M8-01 lands).
  - Tempo 30–250 BPM with a slider and ± steps, tap tempo, meter and accent presets (including odd groupings), and a count-in. A large iPad layout with a visual beat indicator that respects `prefers-reduced-motion`.
  - Uses the M8-01 engine with latency compensation. Don't build a separate click.
  - The click keeps time across tab switches within the app. Leaving Tools stops it, unless the learner pins it on (decide in the WP and note it).
  - Unit tests for tap-tempo maths. E2E: start, change tempo, stop.

### M8-21 · Promote Tracks R and T in onboarding and the frontier
- **Status:** todo
- **Deps:** M8-05, M8-09, M1-16, M1-06, M1-26
- **After:** M6-10
- **Owns:** `app/src/engine/frontier.ts`, `app/src/engine/frontier.test.ts`, `app/src/onboarding/steps/notation.tsx`
- **Acceptance:**
  - Track T is in everyone's frontier after F4. Track R is promoted when the learner reads or wants to learn standard notation (`reading.reads.staff || reading.learn.staff`, from M1-26), and for the jazz and general goals. Otherwise it stays optional (soft-unlocked and previewable).
  - Staff ↔ fretboard drills turn on when the learner reads or is learning standard notation.

### M8-22 · Reading and meter achievements
- **Status:** todo
- **Deps:** M1-13, M8-07, M8-08, M8-10
- **After:** M6-10
- **Owns:** `app/src/engine/gamification/achievements/reader-*.ts`, `app/src/engine/gamification/achievements/meter-*.ts`
- **Acceptance:**
  - "Open-position reader", "5th-position reader", "Waltz, shuffle, march" (meter by ear) and "Steady pulse" (no click for 8 bars). Mastery-based, one file each.

### M8-23 · M8 milestone QA
- **Status:** todo
- **Deps:** M8-01, M8-02, M8-03, M8-04, M8-05, M8-06, M8-07, M8-08, M8-09, M8-10, M8-11, M8-12, M8-13, M8-14, M8-15, M8-16, M8-17, M8-18, M8-19, M8-20, M8-21, M8-22
- **Owns:** `docs/progress.md`, `app/e2e/m8-23.spec.ts`
- **Acceptance:**
  - Check the §11 M8 definition of done: staff → fretboard fluent in open and 5th position, and 4/4, 3/4 and 6/8 identified and counted.
  - A production screenshot pass, and a progress update.

## M9: Tab reading

A short track for learners who want to read tab. Tab maps straight onto skills Fretwork already teaches (string numbers and fret positions), so the track is small: read tab → find it on the neck, neck → write it as tab, then read short phrases. The same engine applies: items, FSRS, speed grading, interleaving, worked examples and guide fading.

### M9-01 · [contract] Tab model and `<TabStaff>` component
- **Status:** done
- **Deps:** none
- **Design:** `docs/design/tab-track.md` (this WP writes it), §8
- **Owns:** `app/src/theory/tab.ts`, `app/src/theory/tab.test.ts`, `app/src/components/tab/**`, `docs/design/tab-track.md`, `app/e2e/m9-01.spec.ts`
- **Acceptance:**
  - Pure tab model: tab line ↔ string (top line = string 1, high E, matching the theory numbering), fret tokens, and a short phrase as a sequence of {string, fret} events. Parse and format plain-text tab (`e|--3--|`). Exhaustive tests.
  - `<TabStaff>`: an SVG with six lines and fret numbers on the lines. It supports highlighting, flashing and ≥44pt tap targets (for picking a line), and string-name labels at the left that guide fading can hide. Dark-first tokens, Okabe–Ito highlights, VoiceOver labels ("string 3, fret 5"). No new dependencies (no VexFlow).
  - `docs/design/tab-track.md` describes the track, its items and drills, the guide levels for tab (string names on the lines fade away), and how it relates to M8 R7 (tab ↔ staff).
  - RTL tests and an iPad e2e render check.

### M9-02 · Tab skills, and D33 "Tab → neck"
- **Status:** done
- **Deps:** M9-01, M1-03
- **Design:** `docs/design/tab-track.md`, §6
- **Owns:** `app/src/engine/skills/tab.ts`, `app/src/engine/skills/tab.test.ts`, `app/src/drills/d33-tab-to-neck/**`, `app/e2e/m9-02.spec.ts`
- **Acceptance:**
  - Skill topic file(s), auto-registered, with items for reading a single tab note on each string. The items are introduced string by string, then interleaved across strings and frets 0–12.
  - D33 shows one note on `<TabStaff>`, and the learner taps that cell on the neck. Speed-aware grading. The first rep of a new item is a worked example. A queried note's answer is never shown on the neck before the answer (the M1-25 rule).
  - Pure logic is in `logic.ts` (unit-tested). RTL plus e2e (`@smoke` happy path).

### M9-03 · D34 "Neck → tab"
- **Status:** todo
- **Deps:** M9-02
- **Design:** `docs/design/tab-track.md`, §6
- **Owns:** `app/src/drills/d34-neck-to-tab/**`, `app/e2e/m9-03.spec.ts`
- **Acceptance:**
  - A highlighted cell on the neck. The learner picks the tab line, then the fret number (choice buttons plus keyboard). Both parts are graded, and a wrong line is distinguished from a wrong fret in the feedback.
  - Uses the M9-02 items in the reverse direction (bidirectional items, as F2/C2 do). Worked example on first exposure. RTL plus e2e.

### M9-04 · D35 "Read a tab phrase"
- **Status:** todo
- **Deps:** M9-02
- **Design:** `docs/design/tab-track.md`, §6, §9
- **Owns:** `app/src/drills/d35-tab-phrase/**`, `app/e2e/m9-04.spec.ts`
- **Acceptance:**
  - A short phrase (3–6 notes, 1–3 strings, within one position) on `<TabStaff>`. The learner taps the notes on the neck in order. A cursor shows the current note. A wrong tap shows the right cell and continues.
  - After a correct phrase, it plays back with the existing audio (lazy Tone.js). Phrases are generated from the learner's known items, so new items stay blocked (research/02).
  - RTL plus e2e.

### M9-05 · Tab track in Learn and the frontier
- **Status:** todo
- **Deps:** M1-16, M1-26, M9-02
- **Design:** `docs/design/tab-track.md`, §3, §4
- **Owns:** `app/src/engine/frontier.ts`, `app/src/engine/frontier.test.ts`, `app/e2e/m9-05.spec.ts`
- **Acceptance:**
  - The tab track is promoted in the frontier when `reading.learn.tab` is set. Otherwise it stays soft-unlocked and previewable. A learner who already reads tab can test out with a short probe.
  - It appears as a module card on Learn with a mastery ring. Unit tests for the frontier rules, and an e2e test of "chose learn tab in onboarding → tab module promoted on Learn".

### M9-06 · M9 milestone QA
- **Status:** todo
- **Deps:** M9-01, M9-02, M9-03, M9-04, M9-05
- **Owns:** `docs/progress.md`, `app/e2e/m9-06.spec.ts`
- **Acceptance:**
  - An end-to-end test: onboarding with "learn tab" → a tab session using D33, D34 and D35 → mastery progress on Learn.
  - A production screenshot pass on the iPad profiles and iPhone, plus a progress update.

---

## M10: Learning-path fixes

From the learning-path review of 2026-10-20 (`docs/review/2026-10-20-learning-path-review.md` and its two copy audits), checked finding by finding against main at `1249751c` and the in-flight branches in `docs/handoff/08-review-verification.md`. The engine follows the evidence rules, but the curriculum around it doesn't yet do what the design promises a beginner: harmony and progressions sit behind months of mastery gates, the frontier is one queue that starves the parallel tracks, a first session brings in about 21 new items, and most skills are never explained before they are tested. Copy is mostly honest, but the first drills a beginner meets mark a wrong answer without saying why.

The first six WPs are `Priority: high`, in the review's order (adjusted where verification changed it). M10-01 and M10-02 keep research/02 rule 7 intact: CAGED stays gated on mastered F2 notes, and progressions on mastered chord construction, so the review's "soft on practising" gates are expressed as per-prerequisite soft gates, not whole-skill soft unlocks.

### M10-01 · [contract] Soft prerequisites per skill, so a gate can mix "mastered" and "practising"
- **Status:** done
- **Priority:** high (blocks M10-02, the songs on-ramp: the review's top finding)
- **Deps:** none
- **Design:** §3.1, §5 (soft unlocking); research/02 rule 7
- **Owns:** `app/src/engine/model.ts` (only the `Skill` interface), `app/src/engine/mastery.ts`, `app/src/engine/mastery.test.ts`, `app/src/placement/test-out.ts`, `app/src/placement/test-out.test.ts`, `app/src/screens/learn/SkillDetail.tsx` (only the unlock sentence), `app/src/screens/learn/SkillDetail.test.tsx`
- **Acceptance:**
  - From the 2026-10-20 review (§1.1) and its verification. Today `softUnlock` applies to all of a skill's prerequisites (`engine/mastery.ts:50-53`, `placement/test-out.ts:33`), so a gate can't say "C3.thirds mastered, C4.sharp-keys practising". Softening a whole skill would also soften a rule-7 gate (F2 → CAGED, chord construction → progressions).
  - Add an optional `softPrerequisites?: readonly string[]` to `Skill`: prerequisites that need only be practising. `prerequisites` keeps its meaning (mastered, unless `softUnlock`). `deriveStatus` and test-out's `meets` read both lists. `softUnlock: true` behaves exactly as today. Test-out probes only the unmet hard prerequisites of a locked entry skill, plus any soft one that isn't practising yet.
  - The skill detail's unlock sentence names both kinds in plain words ("It joins your sessions once you've mastered X and are practising Y").
  - No skill changes its gates in this WP. Unit tests cover mixed gates in `deriveStatus` and test-out. The registry test asserts that every `softPrerequisites` ID exists.

### M10-02 · Songs on-ramp: stage C8 by key group and shorten the chord, harmony and capo gates
- **Status:** todo
- **Priority:** high (review finding 1: a songs learner reaches a Roman numeral after six to ten weeks and a progression after two to three months)
- **Deps:** M10-01
- **Design:** §5 (M-Harmony and M-Progressions "open early, in parallel"); research/02 rule 7; research/03 order
- **Owns:** `app/src/engine/skills/c5.ts`, `app/src/engine/skills/c5.test.ts`, `app/src/engine/skills/c6.ts`, `app/src/engine/skills/c6.test.ts`, `app/src/engine/skills/c7.ts`, `app/src/engine/skills/c7.test.ts`, `app/src/engine/skills/c8.ts`, `app/src/engine/skills/c8.test.ts`, `app/src/engine/skills/c9.ts`, `app/src/engine/skills/c9.test.ts`, `app/src/engine/skills/c10.ts`, `app/src/engine/skills/c10.test.ts`, `app/src/engine/skills/registry.test.ts`, `app/src/storage/db.ts` (hotspot: append one version), `app/src/storage/export-import.ts`, `app/src/storage/migrations/c8-stages.ts`, `app/src/storage/migrations/c8-stages.test.ts`, `docs/progress.md`, `app/e2e/m10-02.spec.ts`
- **Acceptance:**
  - Verified on main: `C5.triads` needs `C3.thirds`, `C3.fourths-fifths`, `C4.sharp-keys` and `C4.flat-keys` mastered (`c5.ts:111`). `C8.numerals-major` (144 items) needs `C4.flat-key-degrees` and `C5.triads` mastered (`c8.ts:72`). `C9.pop` needs it mastered (`c9.ts:37`). `C10.capo-g-c-d` needs `C4.sharp-keys` and `C5.triads` mastered (`c10.ts:46`). M4-07's progression-ear skills open with `C9.pop`, so they wait behind the same chain.
  - **C8 in three key groups.** Split `C8.numerals-major` into: stage 1 (C, G, D); stage 2 (A, E, F); stage 3 (B, F♯, B♭, E♭, A♭, D♭). Keep the ID `C8.numerals-major` for stage 1, so `C9.pop`, M4-07's I6 skills, the D11 tests and the existing e2e fixtures stay valid. Give the later stages new IDs. Stage 1 is hard on `C5.triads` and soft on `C4.sharp-key-degrees` (`softPrerequisites`, M10-01). Stage 2 is soft on stage 1. Stage 3 is soft on stage 2 and hard on `C4.flat-key-degrees`, which is where that gate belongs. Nashville stays soft on stage 1, scoped to its keys or split the same way (worker's choice, explained in the report).
  - **C5.triads:** hard on `C3.thirds` (a triad is two stacked 3rds, so rule 7's intervals → chord construction gate holds), soft on `C4.sharp-keys`. `C5.sevenths` keeps its `C3.sevenths` gate.
  - **C9.pop:** hard on `C5.triads` (rule 7: chord construction → progressions), soft on C8 stage 1.
  - **C10.capo-g-c-d:** soft on `C4.sharp-keys` and `C5.triads`. A capo question needs "which key sounds", not mastered spelling.
  - **C7.minor-boxes:** soft on `C6.minor-cores` instead of hard on `C6.minor-shapes`. CAGED's F2 gate still holds through `C6.triad-cores`.
  - **C6.triad-cores:** keeps F2 ×2 mastered (rule 7). See the decision line for `C5.triads`.
  - Migration (schema version, the `migrations/c5-tone-stages.ts` pattern, frozen): cards, review-log rows and skill states for C8 items in the stage-2 and stage-3 keys move to their new skill. A mastered `C8.numerals-major` carries to every stage. JSON import restages old exports the same way. Migration test against fake-indexeddb.
  - Only stage 1 is probed in placement. The later stages set `skipPlacement` with a reason. Test-out scopes follow from the gates (M10-01). Unit tests cover the new gates.
  - The gate rationale comments in `c5.ts`, `c8.ts`, `c9.ts` and `c10.ts` say what changed and why. `docs/progress.md` records the change from the old gates and why rule 7 still holds.
  - A unit test (or a short scripted simulation in `c8.test.ts`) shows the first C8 card is reachable once `C3.thirds` is mastered and C4 sharp keys are practising, with no flat-key mastery.
  - E2E: a seeded songs learner with `C3.thirds` mastered sees Chords and Harmony open on Learn, and a session serves a D11 numeral in C, G or D.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): `C6.triad-cores` stays hard on F2 ×2 and becomes soft on `C5.triads` (practising). Placing a triad on the neck needs the string notes to be automatic (the hard part), while spelling triads is reinforced by building them, so interleaving the two is a desirable difficulty, not an overload. Rule 7 holds.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): stage 1 is C, G, D. Three keys keep the first harmony stage small enough to master in days (early success, low load), and they are the commonest keys for beginner songs. A and E come in stage 2.

### M10-03 · Session lanes and a new-item cap, so parallel tracks get a turn
- **Status:** todo
- **Priority:** high (review findings 2 and 4; I6 ear (M4-07) and F4 rhythm (M6-08) both open on day one, and the one-queue frontier starves them)
- **Deps:** none
- **After:** M4-07, M6-08
- **Design:** §3.3, §5 ("open early, in parallel"; Ear and Rhythm "from day one"); research/02 rules 6, 11, 13
- **Owns:** `app/src/engine/session.ts` (hotspot), `app/src/engine/session.test.ts`, `app/src/engine/config/session.ts`, `app/src/engine/frontier.ts` (only `orderFrontier`, a new `frontierLanes`, and the I3 module placement), `app/src/engine/frontier.test.ts`, `app/src/session/runner.ts` (hotspot: only how the frontier is passed to `buildSession`), `app/e2e/m10-03.spec.ts`
- **Acceptance:**
  - Verified on main: `orderFrontier` (`frontier.ts:239-247`) sorts by goal-promoted module, then `order`. `buildSession` (`session.ts:257-270`) fills every free slot with new blocks front to back, with no cap. A 10-minute day-one session plans 84 entries: 21 new items from 2 skills (F1.alphabet, F2 string 6). For "general", C1 and C2 (about 300 items) come before any C3 or C4 item. With M4-07 and M6-08, the Ear and Rhythm skills are open on day one, but they sit behind every core module.
  - `engine/config/session.ts` gains `maxNewPerSession` (8 at 10 minutes, scaled by minutes; the adaptive band may raise it while accuracy is above its top) and `lanes` (a 2:1:1 ratio: the first open goal-promoted module; the first open core neck module; one parallel track, Ear or Rhythm, once it has open skills).
  - `buildSession` takes lanes (ordered item lists) and draws new blocks round-robin by the ratio, up to the cap. A block never mixes lanes. Per-lane order is today's order. A goal with no promoted modules ("general") uses the default module order for its primary lane. The very first session stays Neck basics, as M4-07's I6 comment and onboarding expect.
  - The runner builds the lanes from the frontier skills. Stretch top-up (`gamification-bridge.ts`) is unchanged.
  - Unit tests, for each goal: a 10-minute day-one session has at most `maxNewPerSession` new items; once two modules are open, a session draws from both; once Ear or Rhythm is open, it appears within the first three sessions; due reviews still come first (rule 16).
  - Move I3 (key signatures) out of the first slice of the Keys lane: either its own module after Progressions, or kept in Keys but ordered after C8 stage 1. M10-07 owns the Learn copy for whichever is chosen.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): when the cap is reached and nothing is due, run one more spaced retrieval pass over today's new items (expanding retrieval inside the session consolidates them), then end the session and say why in plain words ("That's enough new material for today: it sticks better after a sleep"). A planned session that ends this way counts as meeting the daily goal: the goal rewards doing the plan, never grinding past it.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): I3 becomes its own "Key signatures" module, ordered after C8 stage 1. A separate module gives it a clear outcome on the Learn map and its own session lane, so it no longer queues behind every C4 item.

### M10-04 · Concept intros: a registry, a session card, and the first ten
- **Status:** done
- **Priority:** high (review finding 3, rule 8: a new learner is asked to recall facts they have never been told)
- **Deps:** none
- **After:** M6-08
- **Design:** §3.3, §6 (worked example on first exposure); research/02 rules 4, 8
- **Owns:** `app/src/learn/intros/**`, `app/src/session/ConceptCard.tsx`, `app/src/session/ConceptCard.module.css`, `app/src/session/ConceptCard.test.tsx`, `app/src/session/intro-gate.ts`, `app/src/session/intro-gate.test.ts`, `app/src/session/SessionScreen.tsx`, `app/e2e/m10-04.spec.ts`
- **Acceptance:**
  - Verified on main: `Skill` has a title and no description (`engine/model.ts:15-33`). No intro or concept registry exists. Sessions show no explanation before a skill's first guided rep. `WorkedExample` is used only on the Learn skill detail (`screens/learn/SkillDetail.tsx`).
  - `learn/intros/<topic>-<slug>.ts(x)`, auto-registered and lazy like `learn/worked-examples` (matched by skill ID, else topic). Each intro is at most 40 words plus at most one small diagram (neck or note wheel), in plain words with no undefined terms. It is not first-load JS: the bundle check must not grow by more than 0.3 KB.
  - The session shows a skill's intro as a dismissible card before the first guided rep of its first new item, when the skill had no cards at session start (`intro-gate.ts`, from existing repository reads; no schema change). It is not shown in review-only sessions, and never twice for one skill. The card is focusable, dismissed by tap, Enter or Space, and doesn't count toward timing or grading.
  - Write ten intros: `F1.alphabet`, `F1.b-c-e-f`, `F1.half-steps`, `F1.whole-steps`, `F2.string6-naturals`, `F2.string5-naturals`, `F3.markers`, `F3.repeat-12`, `C1.octaves`, `C3.thirds`. Source them from research/03's "Learner can DO" column and its misconceptions. If M4-07 and M6-08 have merged, also add `F4.pulse` and the first I6 interval and chord sets.
  - RTL tests for the card and the gate. E2E: a fresh learner's first session opens with the alphabet intro, then the guided rep; a second session doesn't show it again.

### M10-05 · Teach on a miss: D1 and D3, with ♯/♭ and a fading note wheel
- **Status:** done
- **Priority:** high (review finding G: the first drills a beginner meets only say "That was D.")
- **Deps:** none
- **Design:** §6 D1, D3, §8; research/02 rules 3, 9; research/03 F1/F2 misconceptions
- **Owns:** `app/src/theory/pitch-display.ts`, `app/src/theory/pitch-display.test.ts`, `app/src/drills/d1-name-the-note/**`, `app/src/drills/d3-note-wheel/**`, `app/e2e/m10-05.spec.ts`
- **Acceptance:**
  - Verified on main: D1 and D3 have no `dNExplain` function, so a wrong answer shows only the shared bar `That was {expected}. You'll see it again shortly.` (`session/SessionScreen.tsx:297-298`). D1 and D3 print ASCII `F#`/`Bb` (from `chromaToPc`, `theory/fretboard.ts:57-58`). Thirteen later drills each have their own ♯/♭ prettifier. D3's `NoteWheel.tsx:86-87` names the seven naturals at every guide level it is shown (1–3), so for letter questions the wheel is the answer.
  - `theory/pitch-display.ts`: `displayPc('F#') → 'F♯'` (and chord and key names), tested. Import it by path, not through `theory/index.ts`, to avoid colliding with M1-44. Replacing the other drills' copies is optional.
  - D1 and D3 show ♯/♭ on buttons, prompts, the worked rep, neck labels and their `expected` value (so the feedback bar shows `That was F♯.`). Item IDs and answer values stay ASCII.
  - `d1Explain` and `d3Explain` in `logic.ts`, rendered under the prompt as D6 does (`D6View.tsx:101-102`), naming the misconception: D1 "You said G. G is one fret lower, at fret 3. Count up from the open E: E F F♯ G G♯."; D3 "The alphabet runs A B C D E F G, then A again" and "There's no sharp between E and F: a half step above E is F." The copy audit (`docs/review/2026-10-20-copy-audit-drills.md` §4 items 1 and 3) has the proposed strings. A correct answer gets one short confirming line. Unit tests per misconception.
  - D3's note wheel at guide levels 1–2 shows the twelve positions and the ½ marks without the natural names (only the start note is named). Level 3 is unchanged.
  - E2E: a wrong D1 answer shows the explanation, and D3 at guide level 1 hides the wheel's names.

### M10-06 · Teach on a miss: D5 intervals and D39 fret landmarks
- **Status:** done
- **Priority:** high (review finding G, second half)
- **Deps:** none
- **Design:** §6 D5, D39; research/02 rule 3; research/03 C3/F3 misconceptions
- **Owns:** `app/src/drills/d5-interval-name/**`, `app/src/drills/d39-fret-landmarks/**`, `app/e2e/m10-06.spec.ts`
- **Acceptance:**
  - Verified on main: neither drill has an explain function. D5's hint is hidden once answered (`D5View.tsx:109`), its buttons are `M3`/`m3`/`P5`/`TT` (`:132`), and only its worked rep spells the names out. D39 shows the bar only, e.g. `That was fret 0 (open).` (`logic.ts:65`).
  - `d5Explain`: "You chose m3 (a minor 3rd, 3 half steps). From C up to E is 4 half steps: a major 3rd, M3." D5 buttons keep the short names, with the full name in their accessible name and in the feedback.
  - `d39Explain`: "Count the dots from the nut: 3, 5, 7." for marker questions; for repeat-12 questions, the worked-example sentence ("the neck repeats every 12 frets"). D39's bar says "the open strings" instead of "fret 0 (open)".
  - Unit tests per misconception, and an e2e test for one wrong answer in each drill.

### M10-07 · Say what each skill and module is for, in plain words on Learn
- **Status:** todo
- **Deps:** M10-01
- **After:** M10-03
- **Design:** §5, §7 (Learn); research/02 rule 15; research/03 "Learner can DO"
- **Owns:** `app/src/learn/outcomes/**`, `app/src/engine/frontier.ts` (only module `summary`, `unlocksAfter` and `misconception` strings), `app/src/screens/learn/SkillDetail.tsx`, `app/src/screens/learn/SkillDetail.module.css`, `app/src/screens/learn/SkillDetail.test.tsx`, `app/src/screens/learn/map-model.ts`, `app/src/screens/learn/map-model.test.ts`, `app/e2e/m10-07.spec.ts`
- **Acceptance:**
  - Verified on main: skill rows show the raw topic code (`SkillDetail.tsx:67`). Module summaries read as tables of contents ("Interval shapes from m2 to P8…", `frontier.ts:52`). Builds-on strings leak engineering: "(and, softly, octaves)" (`:50`). Misconception callouts are about the learner, not to them (`:44`, `:105`, `:156`), with none for Keys, Harmony, Arpeggios, Scales or Ear. "Locked: preview" (`map-model.ts:146,151`) previews only a title for 45 of 67 skills.
  - One-line outcomes for every registered skill in a lazy `learn/outcomes/` registry (not on `Skill`, which is first-load), shown under the skill title. Source them from research/03's "Learner can DO" column. A registry test fails when a skill has no outcome.
  - Module summaries rewritten as outcomes (the screens audit's Top 10 item 3 has examples). `unlocksAfter` in plain words. Misconceptions in the second person, plus new ones for Keys and Harmony (screens audit item 8). Use `♭7`, not `b7` (`frontier.ts:70`).
  - Drop the topic code from the skill row. "Locked: preview" stays only when there is an outcome, intro or worked example to show, otherwise "Locked".
  - Modules with no skills ("Coming soon") are grouped after the open and locked ones on the map. After M4-07, M6-06 and M6-08, only Advanced, Meter and Reading are left.
  - RTL tests, plus an e2e test that a locked skill shows its outcome.

### M10-08 · One vocabulary in the drills: ♯/♭, ♭3/♭7, whole and half steps, one mic voice
- **Status:** todo
- **Deps:** M10-05
- **Design:** §6; copy audit (drills) §2 items 1–6, 10
- **Owns:** `app/src/drills/d2-find-the-note/**`, `app/src/drills/d4-octave-finder/**`, `app/src/drills/d6-interval-tap/**`, `app/src/drills/d7-spell-it/**`, `app/src/drills/d16-play-note/**`, `app/src/drills/d17-play-sequence/**`, `app/e2e/m10-08.spec.ts`
- **Acceptance:**
  - Verified on main (copy audit, drills, all STILL TRUE): ASCII pitch names in D2, D4 and D16; ASCII `b3`/`b7` in D6 labels and feedback (from `theory/intervals.ts` degree IDs) and in D7's formula (`ContextPanel.tsx:27`, `logic.ts:366`); `W W H` never expanded in D7 (`ContextPanel.tsx:32`, `logic.ts:364`); mic copy differs between D16 and D17 in every message.
  - D2, D4 and D16 show pitch names through `displayPc` (M10-05). D6 and D7 show `♭3`/`♭7` (display only; theory IDs unchanged). D7 expands W and H once ("whole, whole, half… A whole step is two frets, a half step one"), as D17 already does.
  - D16 and D17 share one set of mic strings, using D17's wording: it names the fix, and says nothing is sent.
  - D4's prompt says how a multi-target round ends ("Tap them in any order. A wrong tap ends the round; tap Done if you can't find the rest."). D4's `2 strings up` says which way. D17's `Show me` becomes `Show me the answer`.
  - Existing tests updated, plus unit tests for each changed string.

### M10-09 · One vocabulary on the screens: "items", one learning/stable legend, Learn's names in Progress
- **Status:** todo
- **Deps:** M10-07
- **Design:** §7; copy audit (screens) §9 items 1–3, Top 10 items 4, 5, 10
- **Owns:** `app/src/components/learning-legend/**`, `app/src/screens/learn/LearnScreen.tsx`, `app/src/screens/learn/ModuleDetail.tsx`, `app/src/session/summary/SessionSummary.tsx`, `app/src/session/summary/copy.ts`, `app/src/session/summary/copy.test.ts`, `app/src/screens/progress/panels/topics.tsx`, `app/src/screens/progress/panels/topics.test.tsx`, `app/src/screens/progress/panels/stats.tsx`, `app/src/screens/today/cards/stats.tsx`, `app/src/components/heatmap/RetentionForecast.tsx`, `app/src/placement/PlacementTest.tsx`, `app/e2e/m10-09.spec.ts`
- **Acceptance:**
  - Verified on main: the unit is a "note" (`today/cards/stats.tsx:50`, "New notes waiting"), an "item", a "fact" (`RetentionForecast.tsx:26`, `PlacementTest.tsx:451`) or "in rotation" (`progress/panels/stats.tsx:32`). "Learning" and "stable" are defined only at the foot of a module's detail (`ModuleDetail.tsx:94-100`). Progress topic titles don't match Learn's module titles (the verification note lists ten mismatches).
  - One word for the unit everywhere a learner reads it (see the decision line).
  - A small `<LearningLegend>` (learning, stable, mastered in one line each) where the numbers first appear: the Learn module card or map header, the session-summary tiles, and Progress topics. "ModuleDetail" keeps or links to it.
  - Progress topic rows are grouped and titled by Learn's modules (`MODULES` titles), with topic rows under them if needed.
  - "Its skills start feeding your sessions once you've made progress…" (`ModuleDetail.tsx:67-68`) is rewritten in learner words.
  - RTL tests for the legend and the topic titles.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): the learner-facing word is "card" everywhere ("12 cards learning, 40 stable"): it matches the one-prompt-at-a-time flashcard model the app actually uses and works for every drill type, while "note" collides with musical notes and "item" is jargon. Don't use "lesson": a skill is practised, not lectured; concept intros are "intro" cards.

### M10-10 · Copy fixes: onboarding, Today, Progress and Settings
- **Status:** todo
- **Deps:** none
- **Design:** copy audit (screens) §1, §4, §6, §7, "smaller fixes"
- **Owns:** `app/src/onboarding/OnboardingFlow.tsx`, `app/src/onboarding/options.ts`, `app/src/onboarding/steps/placement.tsx`, `app/src/onboarding/steps/notation.tsx`, `app/src/screens/today/cards/streak-repair.tsx`, `app/src/screens/today/cards/streak-repair.test.tsx`, `app/src/components/heatmap/HeatmapLegend.tsx`, `app/src/components/heatmap/CellDetail.tsx`, `app/src/screens/privacy/PrivacyScreen.tsx`, `app/src/onboarding/calibration/CalibrationSetting.tsx`, `app/e2e/m10-10.spec.ts`
- **Acceptance:**
  - All verified STILL TRUE on main. The welcome screen says "change them later in Progress" (`OnboardingFlow.tsx:103-104`): make it "in Settings". "Fretting hand on the left" (`options.ts:13`) becomes "You fret with your left hand" (and the mirrored line for left-handed). "anything you don't know is skipped" (`steps/placement.tsx:15`) becomes "it stops asking about anything you don't know yet".
  - "Your streak will be restored shortly." (`streak-repair.tsx:173`) says when.
  - The heatmap legend (`HeatmapLegend.tsx:20`) and cell detail ("Answers from recall" → "Answers without a hint"; "Stable for" → "Remembered for", `CellDetail.tsx:39,62`) use learner words.
  - "add to home screen" → "Add to Home Screen" (`PrivacyScreen.tsx:46-47`). The calibration "Tap time" row gets a one-line hint (`CalibrationSetting.tsx:14-18`).
  - The notation step promises "its reading track moved up" (`steps/notation.tsx:22`) for a track that shows "Coming soon". Add "(the reading track is coming later)" until M8-21 promotes Track R. M8-21 also owns this file, but it is far from ready.
  - Tests updated, plus an e2e test of the welcome copy.

### M10-11 · Copy fixes: the later drills' prompts and notices
- **Status:** todo
- **Deps:** none
- **Design:** copy audit (drills) §3, §4 items 6–9, runners-up
- **Owns:** `app/src/drills/d9-build-caged/**`, `app/src/drills/d13-capo/**`, `app/src/drills/d36-name-the-chord/**`, `app/src/drills/d37-chord-tones-neck/**`, `app/src/drills/d38-build-the-chord/**`, `app/src/drills/d40-key-signature/**`, `app/src/drills/d-pentatonic-box/**`, `app/e2e/m10-11.spec.ts`
- **Acceptance:**
  - All verified STILL TRUE on main. D40's terse prompts gloss their terms ("Which minor key shares its key signature (its relative minor)?", "Which key is its V, a 5th up?", "Which major key has this key signature?"; `text.ts:84-88`).
  - D36 says "type" for "quality" in its entry hints ("Tap its root (the lowest note), then its type", `D36View.tsx:125-126`).
  - D38: "Fret 9 is out of reach." gives the reason (`D38View.tsx:86`). "one voicing" becomes "one way to play" (`:159`). The span panel reads as a sentence (`ContextPanel.tsx:66`).
  - Multi-target rounds (D9, D37, the pentatonic box) say on every prompt how a round ends and what Done does. Today only D37's hint-less state does (`D37View.tsx:214`).
  - Typographic apostrophes in D13 and the pentatonic box match the rest of the app.
  - Tests updated for each changed string.

### M10-12 · Split C2 by string, with a milestone per string
- **Status:** todo
- **Deps:** M4-08
- **After:** M10-02, M10-05, M10-08
- **Design:** §3.7 (achievements), §5; research/03 C2 (weak-cell targeting); research/02 rule 15
- **Owns:** `app/src/engine/skills/c2.ts`, `app/src/engine/skills/c2.test.ts`, `app/src/engine/skills/registry.test.ts`, `app/src/storage/db.ts` (hotspot: append one version), `app/src/storage/export-import.ts`, `app/src/storage/migrations/c2-strings.ts`, `app/src/storage/migrations/c2-strings.test.ts`, `app/src/engine/gamification/achievements/whole-neck.ts`, `app/src/engine/gamification/achievements/helpers.ts`, `app/src/engine/gamification/achievements/string-4-master.ts`, `app/src/engine/gamification/achievements/string-3-master.ts`, `app/src/engine/gamification/achievements/string-2-master.ts`, `app/src/engine/gamification/achievements/string-1-master.ts`, `app/src/engine/gamification/achievements/achievements.test.ts`, `app/src/drills/d1-name-the-note/drill.ts`, `app/src/drills/d2-find-the-note/drill.ts`, `app/e2e/m10-12.spec.ts`
- **Acceptance:**
  - Verified on main: `C2.all-notes` is one 120-item skill (`c2.ts:16`). Mastery needs 108 of them stable, so its ring reads 0% for weeks, and "Whole neck" is its only milestone.
  - Split it into string stages in teaching order: naturals on strings 4, 3, 2 and 1 (soft on F2 practising, in turn), then accidentals on 6–5, then accidentals on 4–1. Keep the ID `C2.all-notes` for the last stage, so drill skill lists, fixtures and specs that seed it stay valid. Item IDs are unchanged.
  - Migration (schema version, the `c5-tone-stages` pattern, frozen) moves cards, logs and states to the stage that owns each item. A mastered `C2.all-notes` carries to every stage. JSON import restages too.
  - "String 4/3/2/1 master" achievements (mastery-tied). "Whole neck" needs every C2 stage mastered (`helpers.ts` takes a list of skills).
  - M4-08 adds `hear-it-find-it` to C2's drill types: keep it on every stage.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): string 1 first (it repeats string 6's names two octaves up, so it transfers almost for free), then 4 and 3 (each reachable by the octave shapes from strings 6 and 5 the learner already knows, C1.octaves), and string 2 last (the B-string shift makes it the hardest).

### M10-13 · Worked examples for Neck basics: F1, F2 string 5 and F3
- **Status:** todo
- **Deps:** none
- **Design:** §6 (worked example on first exposure); research/02 rule 8
- **Owns:** `app/src/learn/worked-examples/f1-alphabet.tsx`, `app/src/learn/worked-examples/f1-steps.tsx`, `app/src/learn/worked-examples/f2-string5.ts`, `app/src/learn/worked-examples/f3-markers.tsx`, `app/src/learn/worked-examples/f1-f3.test.tsx`, `app/e2e/m10-13.spec.ts`
- **Acceptance:**
  - Verified on main: 9 example files cover 22 of 67 skills. None of the first module's F1 skills, `F2.string5-naturals` or F3 has one.
  - One example each for `F1.alphabet`, `F1.b-c-e-f` (the trap: no sharp between E–F and B–C), `F1.half-steps` and `F1.whole-steps` (they may share one file), `F2.string5-naturals` (landmarks, like `f2-landmarks.ts`), and `F3.markers` and `F3.repeat-12`. Follow the `c5-root-first.tsx` pattern: an idea line, three fading steps and one trap.
  - The registry test lists the skills covered.

### M10-14 · Worked examples for intervals, harmony, progressions, capo and boxes
- **Status:** todo
- **Deps:** none
- **After:** M10-02
- **Design:** §6; research/02 rule 8
- **Owns:** `app/src/learn/worked-examples/c3-fourths-fifths.tsx`, `app/src/learn/worked-examples/c8-numerals.tsx`, `app/src/learn/worked-examples/c9-rotation.tsx`, `app/src/learn/worked-examples/c10-capo.tsx`, `app/src/learn/worked-examples/c7-box-1.tsx`, `app/src/learn/worked-examples/c3-c10.test.tsx`
- **Acceptance:**
  - Verified on main: `c3-gb-thirds` covers only `C3.thirds`. Nothing covers the 4ths/5ths G–B shift, C7, C8, C9 or C10.
  - Examples for `C3.fourths-fifths` (the G–B "one fret up" rule), C8 stage 1 (I IV V in C), `C9.pop` (I–V–vi–IV and its rotation), C10 (capo: count up) and `C7.minor-boxes` (box 1 around the E shape).
  - Use the stage IDs from M10-02 when it has landed, otherwise topic matches.

### M10-15 · Today: a first-day line, and streak freezes explained
- **Status:** todo
- **Deps:** none
- **Design:** §3.7, §7 (Today); research/02 rule 15
- **Owns:** `app/src/screens/today/cards/hero.tsx`, `app/src/screens/today/cards/hero.test.tsx`, `app/src/components/goal-ring/progress.ts`, `app/e2e/m10-15.spec.ts`
- **Acceptance:**
  - Verified on main: the hero's only cue is the button (`hero.tsx:11-14`), and "No streak freezes held" shows from day one (`goal-ring/progress.ts:31`) with no explanation.
  - A learner with no cards sees one line: "Your first session takes about N minutes and starts with the notes on the low E string." (N from their session length; the starting topic from the frontier, not hard-coded).
  - The freezes line is hidden until a freeze is held. The first time one is shown, one line explains it ("It covers a missed day automatically; you earn one every 7 days", from gamification config).
  - RTL tests, and an e2e test for a fresh profile.

### M10-16 · Placement probes for octave shapes and triad cores, and test-out from the Learn map
- **Status:** todo
- **Deps:** M10-01
- **After:** M10-09
- **Design:** §3.4 (placement, test-out)
- **Owns:** `app/src/engine/config/placement.ts`, `app/src/engine/skills/c1.ts`, `app/src/engine/skills/c1-every-octave.ts`, `app/src/placement/algorithm.test.ts`, `app/src/screens/learn/LearnScreen.tsx`, `app/e2e/m10-16.spec.ts`
- **Acceptance:**
  - Verified on main: placement probes F1, F2, C2, C3, C4, C5 and C8 (`engine/config/placement.ts:8`). C1, F3, C6, C7, C10 and I3 are never probed. Test-out is offered only on a locked module's detail (`ModuleDetail.tsx:72-78`).
  - Add C1 (`C1.octaves` and `C1.octaves-gb-shift`; the others `skipPlacement` with a reason) and C6's `C6.triad-cores` to the probed topics, within the 3-minute budget. Show the expert run's timing in the report.
  - The Learn map header offers "Test out" for the first locked module in the goal's order, which opens the existing test-out flow.
  - Unit tests for the probe set; an e2e test for the header entry.

### M10-17 · Achievements for chords, CAGED, harmony and progressions, and a fair speed demon
- **Status:** todo
- **Deps:** M6-08
- **After:** M10-02
- **Design:** §3.7 achievements; research/02 rule 15
- **Owns:** `app/src/engine/gamification/achievements/chords-*.ts`, `app/src/engine/gamification/achievements/caged-*.ts`, `app/src/engine/gamification/achievements/harmony-*.ts`, `app/src/engine/gamification/achievements/progressions-*.ts`, `app/src/engine/gamification/achievements/speed-demon.ts`, `app/src/engine/config/gamification.ts`
- **Acceptance:**
  - Verified on main: 10 achievements exist (notes, streaks, two mic milestones). None is for chords, CAGED, harmony or progressions. Speed demon is a fixed 1.2 s median (`config/gamification.ts:27`), while About says answers are timed against the learner's own tap time.
  - Mastery-tied achievements (`masteryAchievement`): for example, "Triads spelled" (C5.triads), "All five CAGED shapes" (C6.major-shapes), "Three-chord songs in any key" (C8 stage 1 or all stages), "Pop progressions" (C9.pop).
  - Speed demon measures against the learner's calibrated tap time (M6-08 already excludes timing drills), or its copy says "1.2 seconds flat".
  - Unit tests for each.
  - PM decision (the user delegated these calls to the PM, 2026-10-20; they are the main learner): milestones mark mastery, never volume: one per module mastered (chords, CAGED shapes, harmony, progressions), plus one for the first song-ready progression; plain, encouraging names; no streak pressure. Speed demon becomes relative to the learner's own calibrated tap time (motor speed differs between people; the goal is fluent recall, not fast hands), with copy that says so.
