# App design: "Fretwork" (working title)

An **iPad-first** guitar learning app that teaches:

- the fretboard
- intervals and chords
- CAGED
- diatonic harmony and common progressions
- ear skills

It is built on evidence-based learning science.

> **Device priority (decided 2026-10-18): iPad first.** The iPad's screen can show the whole neck at a usable size, alongside context such as a chord diagram, the key's chords or the CAGED chain. Design, layout and test for iPad (landscape primary, portrait supported, including Split View / Stage Manager widths). iPhone must keep **working** (the compact layout below) but is best-effort. We don't compromise the iPad experience for it.

Inputs:

- [research/01-existing-apps.md](../research/01-existing-apps.md)
- [research/02-learning-science.md](../research/02-learning-science.md)
- [research/03-curriculum.md](../research/03-curriculum.md)

Topic IDs (F1, C6, I1, …) refer to the curriculum map in research/03.

---

## 1. Product principles

1. **Practice, not reading.** Every screen in a session asks the learner to answer something. Explanations are short worked examples that lead straight into practice.
2. **The app decides what to practise; the learner decides what they want.** FSRS scheduling and the adaptive scope are always on. Goals, genre, session length and what they read or want to learn to read are the learner's choice.
3. **Speed is part of knowing.** A note you have to count up to has not been learned yet. Every answer is timed and graded against a personal target.
4. **Sound, sight and name together.** Each answer plays the pitch and shows its name and position.
5. **Fade the training wheels.** Visual guides (dots, labels, inlays, highlighted roots) fade as competence grows.
6. **Use the real guitar.** An optional mic mode turns screen knowledge into playing.
7. **Duolingo-style motivation that serves learning.** A user decision (2026-10-18). Use streaks, a daily goal, XP, achievements and celebratory moments to build a daily habit. Every reward is wired to the behaviours the evidence supports: a short daily session, doing due reviews, and genuine mastery. Nothing rewards grinding easy items or punishes mistakes. See §3.7.
8. **Local-first and private.** No account needed. Everything works offline. Data stays on the device, with export/import.

## 2. Platform and tech decision

| Concern | Decision | Why |
|---|---|---|
| Platform | **PWA** (installable to the home screen), **iPad-first**, with Capacitor for a later App Store build | Targets iPadOS Safari and standalone mode; iPhone also works from the same codebase. Deploys to `guitar.dwellsee.com` immediately. iPadOS Safari supports Web Audio, the mic (getUserMedia), IndexedDB and standalone display. |
| UI | **React 19 + TypeScript (strict) + Vite** | Mature ecosystem and familiar to agents. |
| Styling | CSS modules or vanilla-extract with design tokens; safe-area insets; `prefers-color-scheme` | — |
| Routing | React Router (or TanStack Router) | — |
| State | Zustand for UI and session state | — |
| Storage | **Dexie (IndexedDB)**, local-first | Cards, review log, settings |
| SRS | **ts-fsrs** (FSRS-6) | Evidence-backed best scheduler |
| Theory | **tonal** | Notes, intervals, chords, keys, Roman numerals |
| Audio out | **Tone.js** (a sampled or plucked-string synth) | Note and chord playback |
| Mic | **pitchy** inside an AudioWorklet, started by a user gesture (an iOS requirement) | MIT-compatible (0BSD) |
| Chord diagrams | Our own SVG (svguitar for reference) | Consistent styling with the fretboard |
| PWA | vite-plugin-pwa (Workbox), full offline precache | — |
| Testing | Vitest (unit). Playwright: **primary** profiles iPad Pro 11" landscape + portrait and iPad mini landscape (full e2e + visual). **Secondary**: iPhone 15 landscape, smoke e2e only (core flow works, nothing overflows). | iPad first |
| Infra | **AWS CDK (TypeScript)**, deployed **locally** (`pnpm ship`; no GitHub Actions): S3 (private) + CloudFront (OAC) + ACM + Route53 for `guitar.dwellsee.com` | AWS profile `smartthings-hp`, existing hosted zone `dwellsee.com` (looked up by name) |
| Backend | **None for v1.** Optional sync (Cognito plus a small API) is a later milestone. | Keeps v1 simple and private |

## 3. Learning engine (the core)

### 3.1 Skills, items and cards

- **Skill**: a node in the curriculum graph, such as `F2.string6-naturals`, `C3.interval-shapes`, `C6.caged-E-shape` or `C8.numerals-major`. Each skill has:
  - prerequisites (by skill ID)
  - a mastery rule
  - a list of item generators
- **Item**: one atomic, testable fact, with a stable ID. For example:
  - `note@s6f5` (the note at string 6, fret 5)
  - `find:G@s5` (find G on string 5)
  - `interval:M3@root-s6` (the major 3rd from a root on string 6)
  - `caged:A-shape:root=C` (the A shape with root C)
  - `numeral:vi@key=D` (the vi chord in D)
  - `prog:I-V-vi-IV:ear` (recognise I–V–vi–IV by ear)
- **Card**: the FSRS state of one item for this user. Use bidirectional cards where it makes sense: position→name and name→positions.
- **Drill type**: an interaction template, such as "tap the position" or "pick the name". A drill type can test items from many skills. Drills are a **plugin interface** (see §6).

### 3.2 Grading: correctness and speed → FSRS rating

```
wrong                              → Again
correct, rt > target               → Hard
correct, fluentTarget < rt ≤ target → Good
correct, rt ≤ fluentTarget         → Easy
```

- Targets are per drill type: `target = baseline + Δ`, where baseline comes from a ~20-second tap-latency calibration during onboarding.
- Defaults: Δ = 2.0s for `target`, 1.0s for `fluentTarget`. All thresholds live in one config so they can be tuned.
- Any hint use caps the rating at Hard.

### 3.3 The session builder

A session lasts the learner's time budget (5, 10 or 15 minutes), and the learner can stop at any point. A builder pipeline fills it.

**Step 1: Due reviews.** Take the FSRS cards that are due, ordered by lowest retrievability first. Cap them at about 70% of the session.

**Step 2: New items.** Take new items from the **frontier**: skills that are unlocked but not yet mastered.
- The goal profile changes the order of frontier skills.
- New items enter as a **short block** of 3–5 reps with a worked example and full guides.
- After the block they **interleave** with review items.

**Step 3: Confusable pairing.** Deliberately place easily confused pairs near each other, for example:
- E/F and B/C cells
- maj vs min triads
- the C vs A CAGED shapes
- I–V–vi–IV vs vi–IV–I–V

The engine learns each user's confusion matrix from their wrong answers and uses it to pick pairs.

**Step 4: Adaptive scope (the 80–90% band).** Track rolling accuracy over the last 20 answers per drill type.
- Above 92%: widen the scope (more frets or strings, fewer guides, more distractors, shorter time limit).
- Below 75%: narrow the scope.

**Step 5: Session end.** Show a summary with:
- items that improved
- a heatmap delta
- "come back tomorrow" copy explaining why spacing works (desirable difficulty: "it felt hard, and that's why it sticks").

### 3.4 Mastery and unlocking

- A skill is **mastered** when ≥90% of its items have FSRS stability ≥ 7 days **and** recent median RT ≤ target.
- A skill is **unlocked** when all its prerequisites are mastered, or "practised", a softer state, for low-risk skills.
- Unlocking is **soft**. Learners can preview any skill; locked skills just won't feed new items into sessions automatically.
- The **placement test** (about 3 minutes, adaptive) can mark items as known. Their FSRS state is seeded at stability ≈ 10 days.

### 3.5 Guide fading (avoids the Fretlight effect)

Each skill has a guide level (0–3) per user. The level goes down as the skill's accuracy and speed improve.

| Level | What the learner sees |
|---|---|
| 3 | Every note labelled, roots highlighted, shape outline drawn |
| 2 | Only the roots highlighted, plus the shape outline |
| 1 | Fret inlays only |
| 0 | Bare neck. Optionally inlays off too ("blind mode"). |

Immediate correct-answer feedback after each response stays on at every level.

### 3.6 Data model (Dexie)

```ts
Settings  { handedness, tuning, reading: { reads: { tab, staff }, learn: { tab, staff } }, goal, sessionMinutes, latencyBaselineMs, micEnabled, accidentalPref }
Card      { itemId, skillId, fsrs: ts-fsrs Card, createdAt, lastReviewedAt }
ReviewLog { id, itemId, drillType, correct, responseMs, rating, hintUsed, answerGiven, at }
SkillState{ skillId, status: 'locked'|'unlocked'|'practising'|'mastered', guideLevel, rollingAccuracy }
Confusion { a, b, count }                // learned confusable pairs
SessionLog{ id, startedAt, endedAt, itemsSeen, accuracy }
```

- Export and import as JSON.
- Schema versioning via Dexie migrations from day one.
- `reading` flags are booleans and all default to false. Settings is a single row, so `reading` replaced the older `notation: 'none'|'tab'|'staff'` without a schema version: `getSettings` maps a stored legacy value on read (`'tab'` → `reads.tab`, `'staff'` → `reads.staff`, `'none'` → nothing), and the next save drops it.

### 3.7 Gamification (Duolingo-style, evidence-guarded)

The user wants a Duolingo-style habit loop. The research (research/02 §8) says gamification gives small positive effects. Expected tangible rewards and leaderboards can backfire, and causal evidence for streaks is thin. Streaks **do** align with what spacing research favours: short, daily, distributed practice. So we adopt the Duolingo mechanics and point them at learning-positive behaviour.

| Mechanic | Design | Guardrail (why) |
|---|---|---|
| **Daily goal** | Picked at onboarding: Casual 5 / Regular 10 / Serious 15 / Intense 20 minutes, or an XP equivalent. A progress ring sits on Today and in the sidebar. | The default is short. Spacing beats cramming. |
| **Streak** 🔥 | Meeting the daily goal extends the streak. Show a flame, a counter, a calendar and milestone celebrations (7, 30, 100, 365 days). | The qualifying bar is the daily goal, not "open the app", so a streak always means real practice. |
| **Streak freezes** | Earn 1 freeze per 7-day streak, hold up to 2, and use them automatically on a missed day. A **weekend amulet** setting skips Saturday and Sunday. **Streak repair** lets you restore a broken streak within 48 hours by doing a double session. | Forgiving by design. Loss aversion is a strong motivator, but harsh breaks cause people to quit (SDT). |
| **XP** | XP per answered item, **weighted toward learning value**. A due review or new item scores more than over-practising an already-stable card. Correct-and-fluent answers earn a small bonus. Wrong answers still earn base XP for attempting. XP from a given card decays if it's already been drilled today. | No incentive to grind easy items or avoid hard ones. Errors are part of learning (desirable difficulties, the 85% band). |
| **No hearts or lives** | Deliberately left out. | Duolingo's hearts punish mistakes, which conflicts with adaptive difficulty at an 80–90% success rate and with retrieval at the edge of competence. |
| **Session celebrations** | Lesson-complete screen with XP, a combo counter for consecutive correct answers, "perfect session" and "new personal best speed" moments, and confetti for milestones. Respect reduced motion. | Celebrate competence ("you now know string 5 to fret 12"), not just activity. |
| **Achievements** | Badges tied to **mastery milestones**: "String 6 master", "Whole neck", "All 5 CAGED shapes of G", "Speed demon (median <1.2s)", "Ear: I–V–vi–IV", plus streak milestones. | Informational, competence-signalling rewards don't undermine intrinsic motivation the way controlling ones do (Deci et al. 1999). |
| **Daily quests** | 3 small rotating quests, e.g. "clear all due reviews", "10 fluent answers on strings 3–4", "try a mic drill". Completing them gives bonus XP or a chest. | Quests nudge toward weak areas and interleaving. |
| **Mastery map** | The fretboard heatmap and skill rings "fill in" over time, which is the long-term progression view. | Visible competence is the strongest and safest motivator. |
| **Reminders** | A streak-at-risk reminder at the user's chosen time. On an installed iPadOS PWA this needs Web Push, which needs a small backend, so it **ships with the sync milestone**. Until then, use in-app nudges and a badge count. | Opt-in, with at most one per day. |
| **Leagues / leaderboards** | Weekly leagues (Duolingo-style) are **opt-in only** and need the sync backend, so they're deferred to M7. They're off by default. | Leaderboards can lower motivation for many learners (Hanus & Fox 2015). Make them a choice. |

Engine wiring:

- The session builder still decides *what* to practise. Gamification only affects *how much* and *how often*.
- Meeting the daily goal never requires drilling non-due, stable cards. When the due and new queue runs dry, top it up with interleaved "stretch" items from the frontier.
- Every gamification event is logged locally, so we can later check whether streak length correlates with retention.

Data model additions:

```ts
Gamification { dailyGoalMinutes, xpTotal, streakCurrent, streakLongest, lastGoalMetDate, freezesHeld, weekendAmulet, streakRepairDeadline? }
DailyProgress { date, xp, minutes, goalMet, freezeUsed, questsCompleted[] }
Achievement { id, unlockedAt }
```

## 4. Personalisation (instead of "learning styles")

Onboarding takes under 3 minutes, and every step is skippable:

1. **Hand and tuning:** right- or left-handed; standard, Drop D, or DADGAD later.
2. **Goal:** "Play songs with friends" (pop / singer-songwriter), "Solo and improvise" (rock-blues), "Jazz", or "Understand everything" (general). The goal reorders frontier skills and picks example progressions and repertoire.
3. **Reading music:** two multi-select questions. **"What can you already read?"** and **"What would you like to learn to read?"**, each offering Tab and Standard notation (both, one or neither; neither is the default). The copy says the neck is taught by name, position and sound either way, and that reading is extra. The answers never lock anything away:
   - **Track R** (standard notation, §12) is promoted when the learner reads or wants to learn standard notation, or has the jazz or general goal.
   - The **M9 tab track** is promoted when the learner wants to learn tab.
   - **Staff ↔ fretboard** drills are on when the learner reads or is learning standard notation; **tab ↔ fretboard** drills when they read or are learning tab.
   - Every reading track stays soft-unlocked and previewable for everyone, whatever they picked.
4. **Daily time:** 5, 10 or 15 minutes.
5. **Latency calibration:** about 20 seconds of "tap the lit dot".
6. **Placement test (optional):** adaptive probes of F1, F2, C2, C3, C5 and C8 that seed cards.

Ear players can choose "start with sound", which puts ear→fretboard drills first in their path.

The About screen explains the evidence honestly: *"This app adapts to what you know and what you want — not to a 'learning style'. Here's why."*

## 5. Curriculum → modules

| Module | Skills | Unlocks after |
|---|---|---|
| **M-Notes 1: Neck basics** | F1, F2 (strings 6 and 5), F3 | — |
| **M-Notes 2: Whole neck** | C1 octaves (including the G–B shift), C2 all strings | M-Notes 1 |
| **M-Intervals** | C3 interval shapes, the G–B shift, interval ear | F1 (and, softly, C1) |
| **M-Keys** | C4 major scale and degrees, I3 circle of fifths and key signatures | F1 |
| **M-Chords** | C5 triads → 7ths → sus/add | C3, C4 |
| **M-Harmony** | C8 diatonic harmony, Roman and Nashville numerals | C4, C5 (triads) |
| **M-Progressions** | C9 progressions, C10 capo and transposition, I6 progression ear | C8 |
| **M-CAGED** | C6 shapes (partial and triad cores first), chaining, root finding | F2, C5 (triads) |
| **M-Pentatonic** | C7 boxes ↔ CAGED, relative minor | C6 |
| **M-Triads** | I1 string-set triads and inversions, voice leading | C6, C5 |
| **M-Arpeggios** | I2 chord tones within shapes and boxes, target notes | C6, C7 |
| **M-Minor & Function** | I4, I5 | M-Progressions |
| **M-Scales** | I7 major scale in 5 positions | C6 |
| **Advanced (optional)** | modes, drop-2, reharmonisation | — |
| **Rhythm (parallel track)** | F4: tap and strum timing | — |
| **Ear (parallel track)** | I6 interval, quality and progression ID | from day one |
| **M-Meter (future, M8)** | T1–T7: time signatures, simple vs compound, counting, meter by ear, accents, pickups and repeats | F4 / D20 rhythm track |
| **M-Reading (future, M8)** | R1–R7: staff reading for guitar (treble 8vb), staff ↔ fretboard by position, rhythm notation, sight-reading | F2 (strings 6 and 5) and T1. Promoted when the learner reads or wants to learn standard notation (`reading.reads.staff` or `reading.learn.staff`), and for the jazz and general goals. Soft-unlocked and previewable for everyone (§4) |

Following the research, **M-Harmony and M-Progressions open early**, in parallel with the fretboard modules, because playing songs drives motivation.

## 6. Drill catalogue (the plugin interface)

```ts
interface DrillType<P = unknown, A = unknown> {
  id: string;                                           // 'name-the-note'
  skills: string[];                                     // skill IDs it can test
  makePrompt(item: Item, ctx: DrillContext): P;         // pure; uses tonal
  render: React.FC<{prompt: P; guideLevel: number; onAnswer(a: A): void}>;
  check(prompt: P, answer: A): { correct: boolean; expected: unknown; confusedWith?: string };
  inputModes: ('tap' | 'choice' | 'mic' | 'keyboard')[];
}
```

| ID | Drill | Input | Topics | Phase |
|---|---|---|---|---|
| D1 | Name the highlighted note | choice (7–12 note buttons) | F2, C2 | M1 |
| D2 | Find the note (one string, region, or all) | tap the neck | F2, C1, C2 | M1 |
| D3 | Note-wheel steps ("a whole step above E", "the note after C in the musical alphabet") | choice or tap the neck | F1 | M1 |
| D4 | Octave finder | tap | C1 | M2 |
| D5 | Interval: name it from two dots | choice | C3 | M2 |
| D6 | Interval: tap the M3/P5/b7 from a root | tap | C3 | M2 |
| D7 | Spell it: key or chord ("notes of Bm7") | ordered choice | C4, C5 | M3 |
| D8 | Find the chord tone in a shape (root, 3rd, 5th, 7th; both directions) | tap / choice | C5, C6, I2 | M3 |
| D9 | Build the CAGED shape at a root (tap or drag the template) | tap/drag | C6 | M3 |
| D10 | Which shape, and which shape comes next? | choice | C6 | M3 |
| D11 | Roman numeral ↔ chord in a key | choice | C8 | M4 |
| D12 | Progression builder: fill the slots, transpose | drag | C9, C10 | M4 |
| D13 | Capo calculator | choice | C10 | M4 |
| D14 | Hear it → identify (interval, quality, progression) | choice | I6 | M4 |
| D15 | Hear it → find it on the neck | tap | I6, C2 | M4 |
| D16 | Play the note on a real guitar | **mic** | F2, C2, C1 | M5 |
| D17 | Play the interval, arpeggio or scale (sequence check) | **mic** | C3, C4, C5, I2 | M5 |
| D18 | Triad inversions on a string set | tap | I1 | M6 |
| D19 | Voice-leading puzzle | tap | I1 | M6 |
| D20 | Tap and strum rhythm | tap / mic onset | F4 | M6 |
| D21 | Visualise it (mental practice): "picture the A shape at fret 5, then tap the roots" | tap | C6 | M6 |
| D22 | Name the note on the staff | choice / keyboard | R1 | M8 |
| D23 | Staff → fretboard: tap where it's played, in the current position | tap | R2 | M8 |
| D24 | Fretboard → staff: place the highlighted fret's note on the staff | tap the staff | R1, R2 | M8 |
| D25 | Read the key signature, then apply it to a note | choice | R3, I3 | M8 |
| D26 | Sight-read: play a short scrolling passage at an adaptive tempo | **mic** | R6, R2 | M8 |
| D27 | Rhythm reading: tap the written rhythm against a click (onset timing) | tap / mic onset | R4, T3 | M8 |
| D28 | Rhythm dictation: hear a bar, then pick or build its notation | choice / drag | R4, T4 | M8 |
| D29 | Complete the bar: drag note values to fill a bar in a given time signature | drag | T1, T2, R4 | M8 |
| D30 | Hear the meter: 3/4 vs 4/4 vs 6/8 vs 12/8 (later 5/4, 7/8) | choice | T4, T7 | M8 |
| D31 | Accent and strum in meter: strum with the correct accents; the click fades out (guidance fading) | tap / mic onset | T5 | M8 |
| D32 | Simple or compound? How many felt beats? | choice | T2 | M8 |
| D36 | What chord is this? A voicing on the neck or a chord diagram → root, then quality | choice | C5, C6 | M3 |
| D37 | Chord tones across the neck: tap every note (or every 3rd, 5th …) of a chord | tap (multi-target) | C5, I2 | M3 |
| D38 | Build the chord: tap a playable voicing from a symbol and a root | tap | C5 | M3 |

**D3 wording and input:**

- **Say "note", not "letter".** Musical-alphabet prompts read "The note before C in the musical alphabet?" and "2 notes after E in the musical alphabet?". Learners read "letter" as jargon, and "in the musical alphabet" keeps these apart from half steps (the note after C there is D, not C♯). Step prompts ("A whole step above E?") are unchanged.
- **The neck is an answer surface.** Finding the note on the neck is the skill, so tapping any cell whose pitch class is the answer counts as that answer. It goes through the same grading, response time and FSRS path as a button. A wrong tap marks the tapped cell as wrong. The answer is marked correct on the low E string, where the step is drawn, and on the tapped string nearest the tap. Musical-alphabet items accept only the natural, so a sharp or flat cell is wrong. The note buttons and the A–G keys stay.
- Before an unguided answer, only the starting note is labelled on the neck, and the tap targets' accessible labels name a string and fret but never a note (M1-25).

**D4 items and grading:**

- **Single shapes** (`octave:s6f5→s4`): a dot is shown and the learner taps its octave on one string, the octave nearest in fret. Tapping the fret the shape would land on with the G–B shift the other way round (unshifted across it, or shifted where there is none) is logged as a confusion between the two shapes, so they get interleaved.
- **Every octave** (`octaves:G`, skill `C1.every-octave`): one G is shown, and the learner taps every other G in frets 0–12. This is its own item, one card per pitch class, so the multi-target round is scheduled by FSRS like any other fact. Each tap is marked at once. The round answers at the last G, at the first wrong tap, or on "Done". It is graded on completion time per target (the drill's `gradedResponseMs`), so the usual speed targets apply. The iPad runs it over the whole neck (frets 13–15 dimmed). Compact screens run it region by region (`neckRegions` windows of the session's compact fret count, so wider on a phone on its side), skipping regions with nothing to find and starting nearest the dot.

**Mic constraint:** pitch identifies the pitch, not the string. Mic drills therefore do one of three things:

- accept any correct position,
- restrict to a region so only one position fits,
- check only the pitch class.

## 7. Screens and UX

### Layout system (iPad-first)

The breakpoints are **width-based, not device-based**, so Split View and Stage Manager windows just work.

| Size class | Width | Typical device | Layout |
|---|---|---|---|
| **Regular-wide** (primary) | ≥ 1024pt | iPad landscape | Collapsible sidebar, full 15-fret neck, plus a **context panel** |
| **Regular** | 744–1023pt | iPad portrait, large Split View | Sidebar collapses to icons; 12-fret neck; context panel moves below the neck |
| **Compact** (best-effort) | < 744pt | iPhone, narrow Split View | Bottom tab bar; zoomed 5-fret neck window; context panel becomes a sheet |

Design every screen at regular-wide first, then make sure it degrades sensibly.

- iPad pointer and trackpad hover states.
- Hardware keyboard shortcuts in sessions: 1–9 and A–G for answers, space to continue, ⌘-K for search.
- Apple Pencil works as a plain pointer. Nothing special is needed.

### Navigation

There are 4 sections: **Today**, **Learn**, **Explore** and **Progress**. Settings sits under Progress.

- **iPad:** a sidebar, plus multi-pane layouts. For example, the Learn map sits on the left and the skill detail and worked example on the right.
- **iPhone:** a bottom tab bar.

### Today

- A **streak flame and counter**, plus the **daily-goal ring**. These are the hero of the screen, Duolingo-style.
- One big **"Start session (10 min)"** button.
- Daily quests, the due count, new items queued, and freezes held.
- The iPad sidebar always shows the streak and daily-goal ring.
- Quick drills: "2-minute fretboard warm-up" and "Ear only (no guitar)".

### Learn

- The skill map, shown as module cards with a mastery ring each. Locked modules can be previewed.
- Skill detail has three parts:
  - a 30-second **worked example**, which is interactive and fades its guides,
  - "Practise this now" for a focused session,
  - the misconceptions callout from research/03.

### Session (full screen, distraction-free)

**iPad landscape (primary):**

- The **full 15-fret neck spans the width**, at real-ish proportions with generous cells. The neck sits in the lower half, within easy thumb and finger reach when the iPad rests on a music stand or lap.
- The prompt and answer buttons sit above the neck.
- A **context panel** runs alongside on the right (collapsible), showing:
  - the key and its diatonic chords
  - the current chord diagram
  - the CAGED chain mini-map
  - the interval legend for the active skill
- The context panel follows guide fading: it shows less at lower guide levels and is hidden at level 0.
- Neck drills **always show the whole neck**, while still restricting the *active* region for adaptive scope. Inactive frets are dimmed, not hidden, which builds whole-neck spatial context.
- Because there's room, the iPad can run **multi-target drills** that don't fit on a phone, e.g. "tap every G" across the whole neck, or "show all 5 CAGED shapes of D".

**iPad portrait:** a 12-fret neck, with the context panel below it.

**iPhone (best-effort):**

- Landscape is recommended for neck drills.
- In portrait, the neck shows a **zoomed region** (about 5 frets) that slides with the item.
- Choice drills are fine in portrait.
- Multi-target, whole-neck drills fall back to region-by-region versions.

**All sizes:** a slim progress bar.
- Feedback within 100ms: a correct note plays and flashes green. A wrong answer plays both the correct and the chosen notes, shows both positions, and prompts a retry later in the session.
- Large touch targets: fret cells ≥ 44×44pt. On an iPad landscape full neck they're about 60–70pt wide.
- iPadOS PWAs have no web haptics, so feedback is visual and audio. Capacitor can add haptics later.

### Explore (reference tools, no grading)

- **Fretboard explorer:** pick a key, scale or chord, then toggle note names, degrees, intervals or CAGED shapes.
- **CAGED visualiser:** pick a chord, then an animated chain of the 5 shapes, highlighting the triad core of each.
- **Chord finder:** tap notes on the neck to get the chord name (via tonal `Chord.detect`). Or type a chord symbol to see voicings.
- **Progression player:** pick a progression and key, see the chords and the playback loop, use a capo/transposer, and switch between numerals and chord names.
- **Circle of fifths:** interactive.
- Every Explore view has a **"Quiz me on this"** button that starts a focused session. This keeps the "recall, not re-reading" rule.

### Progress

- A **fretboard heatmap** of mastery per cell (colour = stability; dimmed = slow).
- Skill mastery rings and retention forecasts ("you'll remember ~92% of string 5 next week").
- Session history, streak, export/import data, settings.

### Visual design

- A dark-first theme suited to practising in the evening. A light theme follows the system setting.
- The fretboard shows a realistic but restrained wood or rosewood tone, with clear string thickness, and colour-blind-safe highlight colours: roots in one colour, chord tones in another, and shapes always distinguished by both colour and outline or shape.
- Respects safe areas and Dynamic Type (rem-based scaling), and supports reduced motion.

## 8. The fretboard component (the most important UI piece)

- An SVG built for touch. Props:
  - `strings` and `tuning`
  - `fretRange` (visible window)
  - `handedness`
  - `markers[]` (note, label, style, shape-outline group)
  - `guideLevel`
  - `onTapCell(string, fret)`
  - `highlight` / `flash` animations
- Hit-testing works on generous invisible cells, so you can tap between frets.
- Orientation:
  - "player view", horizontal with the low E at the bottom, is the default;
  - "chart view", vertical, is used for chord diagrams.
- Smooth window transitions when the region changes, which respect reduced motion.
- Pure presentation: theory comes from a `fretboard-model` module (pure functions plus tonal) that maps (string, fret) ↔ note, finds positions, and builds CAGED and triad shapes. It is unit-tested exhaustively.

## 9. Audio

- **Output:** Tone.js with a plucked-string sound, or small samples of a few notes per string, pitch-shifted. The AudioContext unlocks on the first tap (iOS requirement). Includes a volume control and a silent mode.
- **Input (mic):**
  - getUserMedia feeds an AudioWorklet running pitchy, which outputs {frequency, clarity}.
  - A note counts after it is stable for ≥80ms.
  - Octave-error tolerance follows the drill's rules.
  - Includes a tuner screen, which doubles as a mic check.
  - Permission is requested only when the learner enables mic mode.

## 10. Non-functional requirements

- **Offline:** the full app is precached. An update toast offers to refresh.
- **Performance:** the first load JS is ≤ 250KB gzip before audio libraries, which are loaded lazily. Drill interactions run at 60fps.
- **Accessibility:** WCAG AA contrast, VoiceOver labels on fretboard cells ("string 5, fret 7, E"), and a keyboard path on iPad.
- **Privacy:** no analytics in v1. Review logs stay local. A future opt-in, anonymised upload would help tune thresholds (§3.2).
- **Quality gates:** typecheck, lint, Vitest unit tests (theory and engine at ≥90% coverage), Playwright e2e on iPhone and iPad profiles, and a Lighthouse PWA check.

## 11. Roadmap and milestones

| Milestone | Scope | Definition of done |
|---|---|---|
| **M0 Foundations** | Repo, tooling, app shell, design tokens, fretboard component and model, engine core (ts-fsrs wrapper, grading, session builder skeleton), Dexie storage, drill plugin interface with D1 as reference, CDK infra, deploy script, orchestration skill | `pnpm verify` is green; a skeleton is live at https://guitar.dwellsee.com |
| **M1 Fretboard notes MVP** | Onboarding (handedness, goal, daily goal, latency calibration), F1–F3 and C2 via D1, D2 and D3, full session loop, Today, Progress heatmap, guide fading, **core gamification** (daily goal, streak with freezes, weekend amulet and repair, XP, session celebrations, first achievements) | A real learner can do daily sessions on **iPad** (landscape and portrait), offline, as an installed PWA. The iPhone smoke flow passes. |
| **M2 Octaves and intervals** | C1, C3 via D4–D6, G–B shift content, confusable pairing, placement test | — |
| **M3 Chords and CAGED** | C4, C5, C6 via D7–D10, Explore (CAGED visualiser, chord finder), worked examples | — |
| **M4 Harmony, progressions and ear** | C8–C10, I3, I6 via D11–D15, progression player, audio playback everywhere | — |
| **M5 Mic mode** | Tuner, D16 and D17, mic onboarding | — |
| **M6 Intermediate** | C7, I1, I2, I4, I5, I7, D18–D21, rhythm track | — |
| **M7 Native and sync** (optional) | Capacitor iOS build, haptics, optional account sync, **Web Push streak reminders**, **opt-in weekly leagues** | — |
| **M8 Reading and meter** (future) | Tracks R and T (research/03), D22–D32, VexFlow notation renderer, metronome and onset-timing engine (§12) | Readers can go from staff to fretboard in open and 5th position at fluent speed. Every learner can identify and count 4/4, 3/4 and 6/8 |

**Deploy continuously, locally.** Every work package merged to `main` ships to production through `pnpm ship`, run on the developer machine: verify → build → deploy to AWS → smoke-test https://guitar.dwellsee.com → push to GitHub. GitHub is only a git remote; there are no GitHub Actions. Milestones group features; they are not release gates. The orchestration skill (see `.claude/skills/`) drives this roadmap.

## 12. Future: reading notation and time signatures (M8)

The **Time signatures** track (T) is valuable for everyone. The **Reading** track (R) is optional. It is promoted when the learner reads or wants to learn standard notation, or has the jazz or general goal, and stays soft-unlocked and previewable for everyone else (§4). Tab reading is its own small track (M9), promoted when the learner wants to learn tab. Both reuse the same engine: items, FSRS, speed grading, adaptive scope and guide fading.

**Rendering.** **VexFlow** (MIT) for staves, clefs, key signatures, notes, rests, beams and tuplets. Guitar parts use treble clef 8vb. Optionally show tab under the staff (VexFlow `TabStave`) at higher guide levels; it fades away as reading improves.

**Items:**

- R1: `staff:E4@treble8vb`, both directions.
- R2: `staff→fret:G3@pos5`. In a given position each pitch has a unique fret, which removes the mic ambiguity problem (§6).
- T1–T2: `meter:6/8:feltBeats`.
- T4: `meter-ear:3/4`.
- R4: rhythm cells, such as `rhythm:dotted-8th-16th`, which are short reusable rhythm patterns.

**Timing engine (shared with the F4 rhythm track, D20):**

- A Tone.js Transport metronome, with accent patterns per meter.
- Tap and mic onset detection.
- Latency compensation. Calibrate the device's audio output and input latency (`AudioContext.outputLatency` plus a tap-to-click calibration) so timing grades are fair on iPad.
- Timing grade: on-time within about ±30–50ms (configurable), feeding the same Again/Hard/Good/Easy mapping.

**Pedagogy (evidence rules apply):**

- **Sound before symbol:** hear, tap and count a meter or rhythm pattern before seeing its notation.
- **Pattern and intervallic reading** (R5) is introduced early, to build read-ahead chunks.
- **Position-by-position reading:** open position, then the 5th position, so each staff note maps to exactly one fret.
- **Fade the click:** in D31 the metronome drops beats as accuracy improves, to build internal pulse. Guidance hypothesis.
- **Interleave confusables:** adjacent lines and spaces, ledger lines, 6/8 vs 3/4, dotted vs straight rhythms.
- **Sight-reading volume matters most** (Kopiez & Lee). D26 generates unlimited fresh passages from the learner's known notes and rhythms, so they never memorise a piece instead of reading it.

**Screens.**

- iPad landscape: the staff above the neck, with both visible at once. This is the key iPad advantage for staff ↔ fretboard drills.
- Explore gains a **Notation viewer**: tap a note on the staff to see it on the neck and vice versa. It also includes a **Metronome** (with meter and accent presets).

**Gamification hooks.** Achievements such as "Open-position reader", "5th-position reader", "Waltz, shuffle, march" (meter-by-ear) and "Steady pulse" (no click for 8 bars).
