# Backlog

Work packages (WPs) for M1–M6 and the future M8 (design §11, §12). The `fretwork-orchestrator` skill reads this file, so **keep the format exact**.

## How this backlog is shaped for parallelism

- **Small:** each WP is ½–2 hours of agent work.
- **Contracts first.** WPs marked **[contract]** land types, registries and interfaces that others build against. Run them first and merge them fast.
- **Vertical slices in new files.** A drill is a new `app/src/drills/<id>/` folder (auto-registered). A skill topic is a new `app/src/engine/skills/<topic>.ts` (auto-registered). Screens, Today cards, Progress panels, Explore views and onboarding steps all become one-file-per-entry registries in M1-01.
- **After** (optional) is a *soft* ordering. By default a WP waits for its After packages too, but when slots would otherwise be idle the planner may start it once its real **Deps** are done. M8 uses this to stay "future" without wasting capacity.
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
  - Explore lists views from `app/src/screens/explore/views/*.tsx` (`{ id, title, order, View }`). The current fretboard explorer becomes the first view.
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
- **Status:** todo
- **Deps:** none
- **Design:** §3.7 (streak repair), §7 Today
- **Owns:** `app/src/screens/today/cards/streak-repair.tsx`, `app/src/screens/today/cards/streak-repair.module.css`, `app/src/screens/today/cards/streak-repair.test.tsx`, `app/e2e/m1-30.spec.ts`
- **Acceptance:**
  - From M1-24 QA: the engine repairs a broken streak after a double session within 48 hours (§3.7), but nothing tells the learner a repair is available, so the mechanic is invisible.
  - A Today card shows while a repair window is open (`streakRepairDeadline` in the future, `streakBeforeBreak` > 0), for example "Your 10-day streak broke. Practise 2× your goal by Tuesday to restore it." It shows progress towards the doubled goal and disappears once the streak is restored or the deadline passes.
  - Tone follows research/02 and §3.7: encouraging and loss-free, with no guilt copy. Reads the stored gamification state only; no engine changes.
  - RTL covers the open, in-progress, restored and expired states. E2E (`m1-30.spec.ts`, iPad projects; iPhone tagged `@smoke`) breaks a streak on a mocked clock, sees the card, does the double session and sees the streak restored.

### M1-31 · Fretboard contrast: light-theme inactive frets and nut string names
- **Status:** todo
- **Deps:** none
- **Design:** §8 fretboard, research/02 (signalling)
- **Owns:** `app/src/components/fretboard/Fretboard.module.css`, `app/src/components/fretboard/Fretboard.tsx`, `app/src/components/fretboard/Fretboard.test.tsx`, `app/e2e/m1-31.spec.ts`
- **Acceptance:**
  - From M1-24 QA screenshots. In light theme, frets outside the active range (13–15 at regular-wide) get a pale grey wash, so they read as highlighted rather than dimmed, and their F/G markers are hard to read. The dark theme dims them correctly. Make light match dark in meaning: inactive frets recede.
  - The nut's string names (E B G D A E) have low contrast on the wood in both themes and are nearly invisible in light. Lift them to ≥4.5:1 against their actual background in both themes. Lighthouse misses this because axe skips SVG text, so assert it in a unit test (compute contrast from the tokens used) or an e2e pixel check.
  - Use tokens only (no new hard-coded colours). Keep the brand rules: no brand yellow on the neck, and `--root` for theory marks.
  - E2E (`m1-31.spec.ts`) screenshots the session neck in both themes on iPad landscape for review; existing Fretboard tests stay green.

### M1-32 · iPad portrait: the Progress mastery map clips its 12th fret
- **Status:** todo
- **Deps:** none
- **Design:** §7 Progress, §7 size classes
- **Owns:** `app/src/components/heatmap/FretboardHeatmap.tsx`, `app/src/components/heatmap/Heatmap.module.css`, `app/src/components/heatmap/Heatmap.test.tsx`, `app/e2e/m1-32.spec.ts`
- **Acceptance:**
  - From M1-24 QA: on iPad portrait the mastery map cuts off its 12th fret column and the "12" label at the right edge.
  - Every fret column and label up to 12 is fully inside the panel on all iPad projects and iPhone, with no horizontal page scroll. Cells keep the §7 minimum size, or the map scrolls inside its own container with a visible affordance if they can't.
  - E2E (`m1-32.spec.ts`, all iPad projects; iPhone tagged `@smoke`): with seeded progress, the "12" label's bounding box lies inside the map's container and the viewport.

### M1-33 · Phone landscape: the session summary's Done is below the fold
- **Status:** todo
- **Deps:** none
- **Design:** §7 session summary, §7 compact
- **Owns:** `app/src/session/summary/SessionSummary.tsx`, `app/src/session/summary/SessionSummary.module.css`, `app/src/session/summary/SessionSummary.test.tsx`, `app/e2e/m1-33.spec.ts`
- **Acceptance:**
  - From M1-24 QA (and the M1-20 vertical-layout note): on iPhone held sideways the session summary's **Done** link sits below the fold. The page scrolls, but the learner may not know to. M1-28 fixed Continue in-session but not the summary.
  - Done (and any primary action) is visible without scrolling on every supported viewport, including the shortest compact landscape. Prefer a compact summary layout at short heights over pinning, and respect `--safe-bottom`.
  - E2E (`m1-33.spec.ts`, iPhone tagged `@smoke`, plus iPad projects): finish a `focusSession` and assert that Done's bounding box lies inside the viewport with `window.scrollY` at 0.

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

### M2-14 · M2 milestone QA
- **Status:** todo
- **Deps:** M2-01, M2-02, M2-03, M2-04, M2-05, M2-06, M2-07, M2-08, M2-09, M2-10, M2-11, M2-12, M2-13
- **Owns:** `docs/progress.md`, `app/e2e/m2-14.spec.ts`
- **Acceptance:**
  - A cross-drill e2e test, a production screenshot pass, and a progress update.

---

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
- **Status:** todo
- **Deps:** M3-03, M3-05
- **Owns:** `app/src/drills/d8-chord-tone/**`, `app/e2e/m3-04.spec.ts`
- **Acceptance:**
  - Tap the 3rd or b7 inside a displayed shape. The shape outline follows the guide level.
  - User request (2026-10-18): identifying the **root** comes first, then the 3rd, 5th and 7th. Prompts cover every chord tone ("tap the root", "tap the 5th"), not only the 3rd and b7.
  - Both directions (rule 12): "tap the 3rd in this shape" and "this highlighted note: root, 3rd, 5th or 7th?". Pair the 3rd/b3 and b7/7 confusions (rule 6).
  - Shapes include the common open and barre voicings as well as the CAGED shapes, at varied roots and positions.

### M3-05 · C6 CAGED skills plus D9 "Build the shape at a root"
- **Status:** todo
- **Deps:** M3-01
- **Owns:** `app/src/engine/skills/c6.ts`, `app/src/drills/d9-build-caged/**`, `app/e2e/m3-05.spec.ts`
- **Acceptance:**
  - Partial shapes and triad cores come first (research/03). The learner taps the template at a given root.
  - The whole neck is shown on iPad, with C vs A shape confusable pairing.

### M3-06 · D10 "Which shape, and which comes next?"
- **Status:** todo
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
- **Status:** todo
- **Deps:** M1-01, M3-01
- **Owns:** `app/src/screens/explore/views/caged.tsx`, `app/e2e/m3-08.spec.ts`
- **Acceptance:**
  - Pick a chord to see an animated chain of the 5 shapes, with triad cores highlighted. Respects reduced motion. Includes "Quiz me on this".

### M3-09 · Explore: chord finder
- **Status:** todo
- **Deps:** M1-01, M3-07
- **Owns:** `app/src/screens/explore/views/chord-finder.tsx`, `app/e2e/m3-09.spec.ts`
- **Acceptance:**
  - Tap notes to name the chord (`Chord.detect`). Type a symbol to see voicings. The chords-db licence (MIT) is checked before adding it.

### M3-10 · Worked examples for C4–C6
- **Status:** todo
- **Deps:** M2-07, M3-01
- **Owns:** `app/src/learn/worked-examples/c4-*.tsx`, `app/src/learn/worked-examples/c5-*.tsx`, `app/src/learn/worked-examples/c6-*.tsx`
- **Acceptance:**
  - Examples plus misconception callouts ("CAGED is a map, not 5 grips").
  - A "find the root first" example: locate the root in a shape, then read the 3rd to tell major from minor (supports D8 and D36).

### M3-11 · Session context-panel registry
- **Status:** todo
- **Deps:** M3-07
- **Design:** §7 session context panel
- **Owns:** `app/src/session/context/**`, `app/src/session/SessionScreen.tsx`
- **Acceptance:**
  - Drills declare their context panels: key and diatonic chords, current chord diagram, CAGED chain mini-map, interval legend.
  - The panel content follows guide fading and is hidden at level 0.

### M3-13 · D36 "What chord is this?"
- **Status:** todo
- **Deps:** M3-03, M3-04, M3-05
- **Design:** §6 D36, research/03 C5 ("name the chord from its dots")
- **Owns:** `app/src/drills/d36-name-the-chord/**`, `app/src/engine/skills/c5-name.ts`, `app/e2e/m3-13.spec.ts`
- **Acceptance:**
  - User request (2026-10-18). A chord voicing is shown on the neck (as a chord diagram as well, once M3-07 exists) and the learner names it: root, then quality (major, minor, 7, maj7, m7, m7b5, sus).
  - The voicings are common open, barre and CAGED shapes at varied roots and positions (rule 12). The answer is never printed on the prompt (M1-25).
  - Items are atomic and FSRS-scheduled (rule 1). Decide and record the item grain in design §6: e.g. one card per quality × shape family, with the root varied per prompt. Major/minor and 7/maj7 are confusable pairs (rule 6).
  - Wrong-answer feedback labels each dot with its degree (R, 3, 5, 7) by shape and colour, and says which note decided the quality ("the 3rd is C, a minor 3rd above A").
  - Unit tests for the item model and grading, plus an e2e test on the iPad projects with the happy path tagged `@smoke`.

### M3-14 · D37 "Chord tones across the neck" (multi-target)
- **Status:** todo
- **Deps:** M3-03, M2-03
- **Design:** §6 D37, §7 (iPad multi-target drills), research/03 C7/I2
- **Owns:** `app/src/drills/d37-chord-tones-neck/**`, `app/src/engine/skills/c5-tones.ts`, `app/e2e/m3-14.spec.ts`
- **Acceptance:**
  - User request (2026-10-18): "highlight all notes in a C chord". The prompt names a chord ("tap every note of C major"), or one degree of it ("tap every 3rd of C major"), in a region, then across the whole neck on iPad.
  - Reuse D4's multi-target machinery (M2-03): per-target feedback, completion-time grading, region by region on compact.
  - Feedback marks each found note with its degree (R, 3, 5, 7), by shape as well as colour. Missed and wrong taps are shown after the attempt.
  - Feeds I2 (chord tones inside a box) and CAGED: the region option can align with a CAGED shape's span.
  - Unit tests for target sets and grading, plus an e2e test on the iPad projects.

### M3-15 · D38 "Build the chord" (tap a voicing)
- **Status:** todo
- **Deps:** M3-03, M3-04
- **Design:** §6 D38, research/03 C5 ("build a chord by tapping")
- **Owns:** `app/src/drills/d38-build-the-chord/**`, `app/e2e/m3-15.spec.ts`
- **Acceptance:**
  - Given a symbol and a starting root on the neck ("Am7, root on string 5 fret 0"), the learner taps one note per string to make a playable voicing.
  - Any voicing that contains the required chord tones, within a playable span (≤4 frets, configurable in `engine/config/<area>.ts`), is accepted. Feedback names each tapped note's degree and flags missing tones.
  - The reverse direction of D36, so the same facts are practised both ways (rule 12).
  - Unit tests for voicing validation, plus an e2e test on the iPad projects.

### M3-12 · M3 milestone QA
- **Status:** todo
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
- **Status:** todo
- **Deps:** M4-01
- **Owns:** `app/src/engine/skills/c8.ts`, `app/src/drills/d11-numerals/**`, `app/e2e/m4-02.spec.ts`

### M4-03 · C9 skills plus D12 "Progression builder"
- **Status:** todo
- **Deps:** M4-01
- **Owns:** `app/src/engine/skills/c9.ts`, `app/src/drills/d12-progression-builder/**`, `app/e2e/m4-03.spec.ts`
- **Acceptance:**
  - Drag chords into slots and transpose. Pointer and keyboard drag both work on iPad. The rotation misconception gets pairing.

### M4-04 · C10 skills plus D13 "Capo calculator"
- **Status:** todo
- **Deps:** M4-01
- **Owns:** `app/src/engine/skills/c10.ts`, `app/src/drills/d13-capo/**`, `app/e2e/m4-04.spec.ts`

### M4-05 · I3 skills plus interactive circle of fifths
- **Status:** todo
- **Deps:** M4-01, M1-01
- **Owns:** `app/src/engine/skills/i3.ts`, `app/src/screens/explore/views/circle-of-fifths.tsx`, `app/e2e/m4-05.spec.ts`

### M4-06 · Audio engine v2
- **Status:** todo
- **Deps:** —
- **Design:** §9
- **Owns:** `app/src/audio/**`
- **Acceptance:**
  - A plucked or sampled guitar tone, chord strums, and progression scheduling on the Tone Transport.
  - Volume and silent mode. It stays lazily loaded and inside the budget.

### M4-07 · I6 ear skills plus D14 "Hear it → identify"
- **Status:** todo
- **Deps:** M4-01, M4-06
- **Owns:** `app/src/engine/skills/i6.ts`, `app/src/drills/d14-ear-identify/**`, `app/e2e/m4-07.spec.ts`

### M4-08 · D15 "Hear it → find it on the neck"
- **Status:** todo
- **Deps:** M4-06, M1-04
- **Owns:** `app/src/drills/d15-ear-find/**`, `app/e2e/m4-08.spec.ts`

### M4-09 · Explore: progression player
- **Status:** todo
- **Deps:** M4-01, M4-06, M1-01
- **Owns:** `app/src/screens/explore/views/progression-player.tsx`, `app/e2e/m4-09.spec.ts`

### M4-10 · "Ear only" quick drill and "start with sound" path
- **Status:** todo
- **Deps:** M4-07, M1-18, M1-06
- **Owns:** `app/src/screens/today/cards/ear-only.tsx`, `app/src/onboarding/steps/start-with-sound.tsx`

### M4-11 · M4 milestone QA
- **Status:** todo
- **Deps:** M4-01, M4-02, M4-03, M4-04, M4-05, M4-06, M4-07, M4-08, M4-09, M4-10
- **Owns:** `docs/progress.md`, `app/e2e/m4-11.spec.ts`

---

## M5: Mic mode

### M5-01 · [contract] Pitch-input API
- **Status:** done
- **Deps:** —
- **Design:** §9 input
- **Owns:** `app/src/mic/types.ts`, `app/src/mic/index.ts`
- **Acceptance:**
  - A `PitchSource` interface ({frequency, clarity} stream, stable-note events ≥80ms, start/stop on a user gesture) and a fake source for tests.

### M5-02 · AudioWorklet pitch detector (pitchy)
- **Status:** todo
- **Deps:** M5-01
- **Owns:** `app/src/mic/worklet/**`, `app/src/mic/detector.ts`, `app/src/mic/*.test.ts`
- **Acceptance:**
  - Synthetic-signal tests for accuracy and octave errors. Permission is requested only when the learner enables mic mode.

### M5-03 · Tuner screen
- **Status:** todo
- **Deps:** M5-02, M1-01
- **Owns:** `app/src/routes/tuner.route.tsx`, `app/src/screens/tuner/**`, `app/e2e/m5-03.spec.ts`

### M5-04 · Mic onboarding and settings
- **Status:** todo
- **Deps:** M5-02, M1-06
- **Owns:** `app/src/onboarding/steps/mic.tsx`, `app/src/screens/progress/panels/mic.tsx`

### M5-05 · D16 "Play the note"
- **Status:** todo
- **Deps:** M5-01
- **Design:** §6 mic constraint
- **Owns:** `app/src/drills/d16-play-note/**`, `app/e2e/m5-05.spec.ts`
- **Acceptance:**
  - Modes: any position, region-restricted, or pitch class only. E2E uses the fake pitch source.

### M5-06 · D17 "Play the interval, arpeggio or scale"
- **Status:** todo
- **Deps:** M5-01
- **Owns:** `app/src/drills/d17-play-sequence/**`, `app/e2e/m5-06.spec.ts`

### M5-07 · Mic quests and achievements
- **Status:** todo
- **Deps:** M2-10, M1-13, M5-05
- **Owns:** `app/src/engine/gamification/quests/try-mic.ts`, `app/src/engine/gamification/achievements/mic-*.ts`

### M5-08 · M5 milestone QA
- **Status:** todo
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
- **Status:** todo
- **Deps:** M6-01
- **Owns:** `app/src/engine/skills/c7.ts`, `app/src/drills/d-pentatonic-box/**`

### M6-03 · I1 skills plus D18 "Triad inversions on a string set"
- **Status:** todo
- **Deps:** M6-01
- **Owns:** `app/src/engine/skills/i1.ts`, `app/src/drills/d18-inversions/**`

### M6-04 · D19 "Voice-leading puzzle"
- **Status:** todo
- **Deps:** M6-03
- **Owns:** `app/src/drills/d19-voice-leading/**`

### M6-05 · I2 arpeggio skills (reusing D8)
- **Status:** todo
- **Deps:** M6-01, M3-04
- **Owns:** `app/src/engine/skills/i2.ts`

### M6-06 · I4 and I5 minor-harmony and function skills, plus choice drills
- **Status:** todo
- **Deps:** M6-01, M4-01
- **Owns:** `app/src/engine/skills/i4.ts`, `app/src/engine/skills/i5.ts`, `app/src/drills/d-function/**`

### M6-07 · I7 major scale in 5 positions
- **Status:** todo
- **Deps:** M6-01
- **Owns:** `app/src/engine/skills/i7.ts`

### M6-08 · F4 rhythm track plus D20 "Tap and strum rhythm"
- **Status:** todo
- **Deps:** M4-06, M8-01
- **Owns:** `app/src/engine/skills/f4.ts`, `app/src/drills/d20-rhythm/**`, `app/e2e/m6-08.spec.ts`
- **Acceptance:**
  - Builds on the shared M8-01 timing engine (metronome, tap/mic onsets, latency calibration, `gradeTiming`). Don't build a separate metronome.
  - D20 covers tap and strum timing against a click (±30 ms target, configurable).

### M6-09 · D21 "Visualise it" (mental practice)
- **Status:** todo
- **Deps:** M3-05
- **Owns:** `app/src/drills/d21-visualise/**`

### M6-10 · M6 milestone QA
- **Status:** todo
- **Deps:** M6-01, M6-02, M6-03, M6-04, M6-05, M6-06, M6-07, M6-08, M6-09
- **Owns:** `docs/progress.md`

---

## M7: Accounts and sync (deferred)

Filed from user feedback (2026-10-18): "allow people to enter an email address to save progress. Login should be optional. To log in, it should email you a link, or a code; both should work. If a user already has progress but no login, it should be transferred to the server so that multiple devices stay in sync." **Not to be worked on yet.** Every package is `blocked` until the user answers the M7 questions in `docs/progress.md` (new AWS services beyond `FretworkSite`, the email sender, and privacy). Design §1 principle 8 still holds: everything works without an account, offline, on one device.

Notes for whoever picks this up:
- **An installed iPad PWA doesn't open email links.** Tapping a magic link opens Safari, which has separate storage from the home-screen app. So the emailed **code** is the primary path in the installed app. The link signs in the browser it opens in. Every email carries both.
- **Merge by design, not last-writer-wins on everything.** Review logs and XP events are append-only, so the union is keyed by ID. FSRS cards can be replayed from logs, or merged with per-card `updatedAt`. Settings use per-field last-writer-wins. Streaks and stats are derived.
- The scope is accounts and sync. The rest of design §11's M7 (Capacitor build, Web Push reminders, opt-in leagues) builds on this and isn't filed yet.

### M7-01 · [contract] Sync model and merge rules (pure)
- **Status:** blocked
- **Deps:** —
- **Design:** §1 (principle 8), §11 M7
- **Owns:** `app/src/storage/sync/model.ts`, `app/src/storage/sync/merge.ts`, `app/src/storage/sync/*.test.ts`, `app/src/storage/db.ts` (hotspot: new schema version for IDs, `updatedAt`, tombstones and an outbox)
- **Acceptance:**
  - Every syncable table (cards, review logs, settings, gamification tables) has a stable ID, `updatedAt` and tombstones. A Dexie schema version is appended, never edited.
  - Pure merge functions for each table follow the rules above. They're property-tested: merging is commutative, associative and idempotent, and no review log is ever lost.
  - Document the sync protocol (push and pull with a server cursor) in `docs/design/sync.md`.

### M7-02 · Infra: passwordless auth and sync API stack
- **Status:** blocked
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
- **Status:** blocked
- **Deps:** M7-01, M7-02
- **Owns:** `infra/lambda/sync/**`
- **Acceptance:**
  - `push` (a batch of changed records) and `pull` (changes since a cursor) per authenticated user. A user can only reach their own data, with a test for it. Batches are size-limited and idempotent.
  - The handlers reuse M7-01's merge functions. Unit tests run against a local DynamoDB fake.
  - `DELETE /account` removes all of the user's server data and the Cognito user.

### M7-04 · "Save your progress": optional email sign-in UI
- **Status:** blocked
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

### M7-06 · Account management and privacy
- **Status:** blocked
- **Deps:** M7-04, M7-05
- **Owns:** `app/src/screens/progress/panels/account-manage.tsx`, `app/src/routes/about.route.tsx`, `docs/design/app-design.md`, `app/e2e/m7-06.spec.ts`
- **Acceptance:**
  - Delete account removes the server data (M7-03) and keeps or clears local data as the learner chooses. Export still works signed in or not.
  - The About and privacy copy explain what's stored (email, progress), where (AWS us-east-1), and why. There's still no analytics.
  - Design §1 principle 8 and §2 (Backend) are updated to describe optional sync.

### M7-07 · M7 milestone QA
- **Status:** blocked
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
- **Status:** todo
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
- **Status:** todo
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
- **Status:** todo
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
- **Owns:** `app/src/screens/explore/views/notation-viewer.tsx`, `app/e2e/m8-19.spec.ts`
- **Acceptance:**
  - Tap a note on the staff to see it on the neck, and vice versa. Staff above neck on iPad. Includes "Quiz me on this".

### M8-20 · Explore: metronome
- **Status:** todo
- **Deps:** M8-01, M1-01
- **After:** M6-10
- **Owns:** `app/src/screens/explore/views/metronome.tsx`, `app/e2e/m8-20.spec.ts`
- **Acceptance:**
  - Meter and accent presets (including odd groupings), tap tempo, and a large iPad layout. Uses the M8-01 engine with latency compensation.

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
- **Status:** todo
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
