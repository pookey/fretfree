# Copy audit: screens, onboarding, Learn, gamification (2026-10-20)

Companion to `2026-10-20-learning-path-review.md`. Everything learner-facing outside the drills folder, at commit `9b0b8df`. Paths are under `app/src/`.

**Overall.** The copy is honest and aligned with research/02: spacing is explained (rule 11), competence is celebrated (§3.7), streak copy is forgiving (rule 15), About cites sources and admits limits, British spelling is consistent. The three real gaps: (1) the "so what": skills have titles but no description, so a beginner never reads what a lesson teaches or why; (2) 36 of 52 skills have no worked example, including the whole first module (F1); (3) terminology drift (item/note/fact/card; stable/known/mastered; Progress topic names vs Learn module names; raw topic codes shown to learners).

## 1. Onboarding (`onboarding/`)

Each step has a `title` and an `explanation` ("why we ask"), per `registry.ts:16`. Good structure.

- **Welcome** `OnboardingFlow.tsx:102-104`: "N quick questions so your practice fits you. It takes under 3 minutes, and you can skip any of them or change them later **in Progress**." Wrong screen: settings moved to Settings (design §7). Should say "in Settings".
- **Install** `steps/install.tsx:29-38` and `shell/InstallHint.tsx:181-191`: clear and honest about Home Screen storage.
- **Your guitar** `options.ts:13`: "Right-handed: Fretting hand on the left" reads as a screen position, not a hand. Propose "You fret with your left hand" / "You fret with your right hand; the neck is drawn mirrored".
- **Goal** `steps/goal.tsx:12-15`: "Your goal decides which topics come next and which progressions and songs the examples use. The practice itself works the same way for everyone." Excellent honest-copy line. Note two "goals" exist (play goal, daily goal); Learn's "Ordered for your goal" (`LearnScreen.tsx:138`) could mean either.
- **Daily goal** `steps/daily-goal.tsx:12-15`: good (rule 11). "Intense · 20 minutes a day" exceeds rule 11's 5–15 min but is allowed by §3.7.
- **Session length** `steps/session-length.tsx:12-15`: fine; good spacing advice.
- **Reading music** `steps/notation.tsx:16-23`: promises "its reading track moved up" for a track that is `track: 'future'` and shows "Coming soon". Add "(coming later)".
- **Calibration** `steps/calibration.tsx:8-14`: "Answers that come quickly are the ones you really know, so we time them. Your screen and your reach add a little to every answer; this measures that, so only the thinking counts." Does not feel like a test. Result `Calibration.tsx:127-129` good.
- **Mic** `steps/mic.tsx:25-30`: clear; privacy sentence good; errors actionable.
- **Placement** `steps/placement.tsx:9-21`: "Already play a bit?" is friendly. "anything you don't know is skipped" is ambiguous (from the test, or from teaching?). "New to the guitar? Skip this step and start at the beginning." is the right reassurance. `PlacementTest.tsx:378-380` "Not sure" copy good.

## 2. Learn (`screens/learn/`, `engine/frontier.ts`, `learn/worked-examples/`)

- **Module cards** `LearnScreen.tsx:87-91`: "Neck basics · In progress · 0/7 skills · 0% learning · 0% stable": four numbers and two undefined terms. The definition lives only in muted text at the foot of the module detail (`ModuleDetail.tsx:95-101`), which is good but buried.
- **Module summaries** (`frontier.ts`) are tables of contents: "The musical alphabet, natural notes on strings 6 and 5, and the fret markers." (`:32`), "Interval shapes from m2 to P8 and the G–B +1 fret shift." (`:52`). No module says what the learner will be able to do.
- **"Builds on"** strings leak engineering: `frontier.ts:50` "The musical alphabet (and, softly, octaves)"; `:181` "Natural notes on strings 6 and 5, and time signatures".
- **Skills have no description.** `engine/model.ts:40-52`: `Skill` has `title` only. `SkillDetail.tsx:64-70` shows title, raw topic code ("F1"), status and counts. The biggest content gap.
- **Misconception callouts** ("Watch out for", `ModuleDetail.tsx:81-86`) exist for 10 of 18 modules. Several are written *about* the learner: `frontier.ts:156` "Theory-heavy learners neglect timing."; `:44` "Frets 7–12 on the middle strings get neglected."; `:105` "“Box prison”: hear the root and move between boxes." Good ones: `:34`, `:96`. No callout: Keys, Harmony, Arpeggios, Scales, Advanced, Ear, Meter, Reading.
- **Worked examples** are the best copy in the app (`c6-caged-map.tsx:76`, `c5-root-first.tsx:98`; stage labels "Worked example / Your turn, with a hint / On your own"; finish line "That's the idea. Now practise it: spaced practice is what makes it stick.").
- **Sessions** show no concept intro: `SessionScreen.tsx` has only the context panel, and for F1 the `AlphabetPanel` (`:330-333`) at guide level ≥ 2.

### Skills with no worked example (36 of 52)

Covered: F2.string6-naturals; C1.octaves; C1.octaves-gb-shift; C2.all-notes; C3.thirds; all C4.*; C5.tones-roots/thirds/fifths/sevenths, C5.triads, C5.sevenths, C5.name-triads/sevenths; all C6.* (topic match), C6.minor-* refined.

Missing: **F1.alphabet, F1.b-c-e-f, F1.half-steps, F1.whole-steps**; F2.string5-naturals; F3.markers, F3.repeat-12; C1.double-octaves, C1.every-octave; C3.fourths-fifths, C3.sevenths, C3.sixths, C3.seconds; I3.sharp-signatures, I3.flat-signatures, I3.dominants, I3.relative-minors; C5.sus-add, C5.name-sus, C5.build-triads, C5.build-sevenths, C5.build-sus, C5.neck-triads, C5.neck-sevenths; C7.minor-boxes, C7.major-boxes, C7.relative; C8.numerals-major, C8.nashville; C9.pop, C9.ii-V-I, C9.blues, C9.minor; C10.capo-g-c-d, C10.capo-a-e, C10.capo-minor.

## 3. Locked and prerequisite copy

- `SkillDetail.tsx:26-31`: "Preview only. It joins your sessions once you've mastered Natural notes on string 6." Tells the learner what; good. "Preview only." alone says nothing.
- `ModuleDetail.tsx:67-70`: "You can preview this module now. Its skills start feeding your sessions once you've made progress on what they build on." "feeding your sessions" is odd; "made progress" vaguer than the skill-level copy.
- `placement/TestOut.tsx:137-145`: excellent; the unlock path is explained. Result lines `test-out.ts:139-141` friendly.
- Nothing on a locked skill says the worked example can be run anyway (it can).

## 4. Today (`screens/today/`)

- Hero `cards/hero.tsx:12-13`: never nudges past the goal (correct for rule 11). For a day-one learner nothing says what to do first; the only cue is the button. Freezes are never explained except the weekend-amulet hint in Settings.
- Context panel `TodayScreen.tsx:13-17` "Short and often": good (rule 11), hidden in a sheet on compact.
- Stats `cards/stats.tsx:46-54`: "New notes waiting" is wrong once alphabet, marker, interval and chord items are queued.
- Streak repair `cards/streak-repair.tsx:148-175`: forgiving and honest. "Your streak will be restored shortly." is vague.
- Quick drills `cards/quick-drills.tsx:72-73`: fine.

## 5. Session summary (`session/summary/`)

- Rule 11 met: `copy.ts:50-51` "Come back tomorrow. Spacing practice out feels harder than cramming, and that's exactly why it sticks…", shown every time.
- Competence first: `copy.ts:14-20` "You now know string 6 to fret 5"; accuracy note `:36-37` "Right in the learning zone: hard enough to stick." Very good.
- `progressText` `copy.ts:87-118`: honest; "stable" undefined here.
- Tiles `SessionSummary.tsx:120-152`: "Learning", "Became stable", "12 stable · 3 stronger": unexplained here.
- Empty session `SessionScreen.tsx:350-351`: good.

## 6. Progress (`screens/progress/`, `components/heatmap/`)

- Legend `HeatmapLegend.tsx:19-20`: "Memory stability: how long until recall drops to 90%" is accurate but opaque.
- Cell detail `CellDetail.tsx:39-69`: "Answers from recall" is opaque (means unguided answers).
- Retention forecast `aggregate.ts:247` "You'll remember ~92% of string 5 next week." is exactly rule 15. "(3 facts practised)" `RetentionForecast.tsx:26`.
- Stats `panels/stats.tsx:28-33`: "Items in rotation" never explained.
- Topics `panels/topics.tsx:15-37`: titles don't match Learn's module titles.

## 7. Settings, About, Privacy

- **About** `screens/about/AboutScreen.tsx`: honest, sourced, readable. Every claim checked against research/02 (FSRS in Anki, Keebler 2014, Binder 1996, Wilson 2019 flagged as a model result, no learning styles, "almost no controlled research on the fretboard itself"). No unsupported claims.
- **Privacy** `PrivacyScreen.tsx`: clear; `:46-47` "add to home screen" lowercase vs "Add to Home Screen" elsewhere.
- **Settings** `SettingsGroups.tsx`: "Placement test" `:171-173` good. "Weekend amulet" is Duolingo jargon but the hint explains it. "Tap time · not measured · Measure" (`CalibrationSetting.tsx:14-25`) has no hint. "Reading music" hint `:239-241` repeats the onboarding promise.

## 8. Achievements and quests (`engine/gamification/`)

- Achievements are competence-framed and mastery-tied (`masteryAchievement`). One tension: "Speed demon" is a fixed 1.2 s (`speed-demon.ts:31-32`) while About says every answer is timed against the learner's own tap time; a slow-tapping learner may never earn it.
- Quests: "Clear your due reviews", "Learn 3 new items", "Recall 5 items fluently", "Fix 2 slips", "Mix 3 skills", "10 fluent answers on strings 3–4", "Get 8 right: Natural notes on string 6". All good and evidence-aligned.

## 9. Terminology and spelling

British throughout (practise/practice correct as verb/noun; visualiser, licence, colour). Inconsistencies:

1. **item / note / fact / card**: "New notes waiting" (`today/cards/stats.tsx:50`), "Items in rotation" (`progress/panels/stats.tsx:32`), "(3 facts practised)" (`RetentionForecast.tsx:26`), "check 12 of those facts again" (`PlacementTest.tsx:451`), "14 items learning" (`copy.ts`), "Learn 3 new items" (quests), "spaced practice is what makes notes stick" (`daily-goal.tsx`, `clear-due.ts`).
2. **stable / known / mastered / learned**: placement says "known"; summary "You now know…"; Learn "stable"/"mastered". Only Learn defines them.
3. **Progress topic names ≠ Learn names**: "Notes and steps" vs "Neck basics"; "Major scale"/"Keys" vs "Keys"; "Chord building" vs "Chords"; "All notes" vs "Every note on every string"; "Diatonic harmony" vs "Harmony"; "Ear training" vs "Ear".
4. **Raw topic codes** "F1", "C5" on every skill row (`SkillDetail.tsx:66`).
5. **goal** means two things (`options.ts`, `LearnScreen.tsx:138`).
6. **b7 vs ♭7**: `frontier.ts:70` vs worked examples.
7. **Home Screen** vs "add to home screen" (`PrivacyScreen.tsx:46`).
8. **"Tap time"** (calibration) vs "speed target" (heatmap) vs "fluent" (quests): three words for one idea with no bridge.
9. Design doc says "lesson"; the UI never does (module/skill only). Pick one and use it in docs too.

## Top 10 changes, ranked by learner impact

1. **Add a one-sentence "what you'll be able to do" per skill.** No current string. Add e.g. `outcome` shown under the title in `SkillDetail.tsx:64`. Examples: F1.alphabet → "Say the next and previous note name without pausing, so every fret you learn has a name ready."; F2.string6-naturals → "Name any natural note on the low E string at a glance: the string every barre chord and CAGED shape is anchored to."; C3.thirds → "See a major or minor 3rd as a shape from any root. This is what tells a major chord from a minor one." (`engine/model.ts:45`, `screens/learn/SkillDetail.tsx:64-70`)
2. **Write worked examples for F1** (all four skills), then F3 and C8. A beginner's first session opens on "A whole step above E?" with no lead-in (rule 8). Follow the `c5-root-first.tsx` pattern: idea line, three fading steps, one trap ("That's F♯: there is no sharp between E and F, so a half step above E is F").
3. **Replace module summaries with outcomes.** `frontier.ts:32` → "Name the notes on the two low strings without counting. Everything else on the neck is measured from these."; `:52` → "Find any interval from any root as a shape, so chords and scales stop being memorised grips."
4. **Define "learning" and "stable" where the numbers appear.** One line under the first module card and the summary tiles: "Learning: your last answer was right. Stable: you'd still recall it a week from now. Mastered: 90% stable, and fast." (`LearnScreen.tsx:88-92`, `SessionSummary.tsx:126-152`, `progress/panels/topics.tsx:134`)
5. **One word for the thing you learn.** "items" everywhere: `today/cards/stats.tsx:50` "New notes waiting" → "New items waiting"; `progress/panels/stats.tsx:32` "Items in rotation" → "Items being scheduled"; `RetentionForecast.tsx:26` "facts practised" → "items practised"; `PlacementTest.tsx:451` "those facts" → "those items".
6. **Fix the welcome screen's pointer.** `OnboardingFlow.tsx:102-104` "…or change them later in Progress." → "…in Settings."
7. **Give the brand-new learner a first step on Today.** When `streak === 0` and no cards: replace the freeze line with "Your first session takes about 10 minutes and starts with the notes on the low E string." Hide the freezes line until one is earned; when first shown: "1 streak freeze held. It covers a missed day automatically; you earn one every 7 days." (`today/cards/hero.tsx:36-37`, `components/goal-ring/progress.ts:30-33`)
8. **Rewrite teacher-voice misconceptions to address the learner, and add the missing ones.** `frontier.ts:156` → "Knowing the notes isn't playing in time. Keep tapping with the click even when the theory feels done."; `:44` → "Watch frets 7–12 on strings 2–4: they're the ones most players skip. And when an octave shape crosses from G to B, it moves up one fret."; `:105` → "Don't get stuck in one box. Find the root by ear, then slide to the next box from it." Add for Keys ("A key signature tells you which notes are sharp or flat, not which chord you start on") and Harmony ("The vi chord is minor even though the key is major: the chord quality comes from the scale, not the key name").
9. **Make the heatmap legend and cell detail learner-readable.** `HeatmapLegend.tsx:20` → "How long each note stays remembered: the days until you'd have a 1-in-10 chance of forgetting it"; `CellDetail.tsx:62` "Answers from recall" → "Answers without a hint"; `:39` "Stable for" → "Remembered for".
10. **Reconcile Progress topic names with Learn, and hide raw topic codes.** `topics.tsx:15-37`: use the module/skill titles; `SkillDetail.tsx:66` drop `{skill.topic}` or render it as the module title. `frontier.ts:50` "The musical alphabet (and, softly, octaves)" → "The musical alphabet. Octaves help, but aren't required."

Smaller fixes worth bundling: `options.ts:13` "Fretting hand on the left" → "You fret with your left hand"; `steps/placement.tsx:14-15` "anything you don't know is skipped" → "it stops asking about anything you don't know yet"; `steps/notation.tsx:22` add "(the reading track is coming later)"; `frontier.ts:70` "b7" → "♭7"; `PrivacyScreen.tsx:46` "add to home screen" → "Add to Home Screen"; `speed-demon.ts:32` baseline-relative or "1.2 seconds flat"; `streak-repair.tsx:173` "will be restored shortly" → "is restored at the end of today's session"; `CalibrationSetting.tsx:14` add hint "How long a tap takes on this screen. Answers are timed from here, so a slow screen never counts against you."
