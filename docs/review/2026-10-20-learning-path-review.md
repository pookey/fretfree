# Learning-path review (2026-10-20)

**Scope.** A review of Fretwork as a learning product, at commit `9b0b8df` (96 work packages live). It asks four things: do the learning paths make sense, does the wording make sense, will this help people learn, and where does the app need to give more help. It is a review only. Nothing here is implemented; the last section turns the findings into work packages for the PM to file in `docs/backlog.md`.

**Method.** Read `docs/research/02` and `03` and `docs/design/app-design.md`; dumped the registered skill graph (56 skills, every prerequisite, soft/hard unlock and item count) from `engine/skills`; read the session builder, frontier ordering, mastery and placement config; audited every learner-facing string in the drills and the screens; and walked the app in a browser as a brand-new "Play songs with friends" learner (onboarding, Today, Learn, a first session with a wrong answer, Explore, Progress).

**Verdict in one paragraph.** The engine is in good shape and faithfully implements the evidence rules: one card per fact, FSRS, speed grading, confusable pairing, guide fading, soft unlocking. The problem is above the engine. The *curriculum as implemented* contradicts the design in three places that matter most for a beginner: harmony and progressions are not "open early", the frontier is a strict queue that starves parallel tracks, and most skills have no explanation at all, so a new learner is asked to recall facts they have never been told. The copy is mostly clear and honest, but wrong-answer feedback often just states the answer, and a few terms drift between screens. The highest-value changes are structural (gating and ordering), not cosmetic, and they are cheap: most are config and prerequisite edits.

---

## 1. The path as implemented

The table below is the live skill graph (from the registry, not from the design doc). HARD = prerequisites must be *mastered* (90% of items at FSRS stability ≥ 7 days, median RT on target). soft = prerequisites need only be *practising*.

| Order | Skill | Gate | Items | Prerequisites |
|---|---|---|---|---|
| 100 | F1.alphabet | HARD | 14 | — |
| 110–130 | F1.b-c-e-f → half-steps → whole-steps | soft | 4, 10, 14 | chain |
| 200/210 | F2.string6-naturals, F2.string5-naturals | HARD | 15 each | — |
| 300/310 | F3.markers, F3.repeat-12 | HARD/soft | 10, 12 | — / F3.markers |
| 1100–1130 | C1.octaves, gb-shift, double-octaves, every-octave | soft | 64, 84, 26, 12 | F2 ×2 (practising) |
| 1200 | C2.all-notes | soft | **120** | F2 ×2 (practising) |
| 1300–1340 | C3.thirds → fourths-fifths → sevenths → sixths → seconds | soft | 20, 50, 16, 34, 20 | F1.half/whole-steps, C1.octaves; then chain |
| 1400–1430 | C4.sharp-keys → flat-keys; sharp-key-degrees → flat-key-degrees | soft | 8, 7, 84, 60 | F1 steps; chain |
| 1450–1480 | I3.sharp-signatures → flat-signatures → dominants, relative-minors | soft | 16, 14, 14, 15 | C4 keys; chain |
| 1500 | C5.triads | **HARD** | 24 | C3.thirds, C3.fourths-fifths, C4.sharp-keys, C4.flat-keys |
| 1510/1520 | C5.sevenths, C5.sus-add | HARD | 48, 36 | C5.triads + C3.sevenths / C3.seconds |
| 1530–1560 | C5.tones-roots → thirds → fifths → sevenths (D8) | HARD | 4, 4, 4, 12 | F2 ×2, C5.triads; chain |
| 1570–1597 | C5.name-* (D36), C5.build-* (D38), C5.neck-* (D37) | HARD | 10–60 | the tones stages, C5 spelling, C1.every-octave |
| 1598 | C8.numerals-major | **HARD** | **144** | C4.flat-key-degrees, C5.triads |
| 1599 | C8.nashville | soft | 72 | C8.numerals-major |
| 1599.2 | C9.pop | **HARD** | 8 | C8.numerals-major |
| 1599.4–.8 | C9.ii-V-I, blues, minor | soft | 2, 4, 2 | C9.pop (+ C5.sevenths) |
| 1600 | C6.triad-cores | HARD | 5 | F2 ×2, C5.triads |
| 1610–1640 | C6 major/minor cores and shapes, dominant7 | soft | 5 each | chain, C3.sevenths |
| 1700–1720 | C7.minor-boxes (HARD), major-boxes, relative | HARD/soft | 5, 5, 10 | C6.minor-shapes; chain |
| 2000–2020 | C10.capo-g-c-d (HARD), capo-a-e, capo-minor | HARD/soft | 9, 6, 9 | C4.sharp-keys, C5.triads; chain |

Not built: I1, I2, I4, I5, I6 (ear), I7, F4 (rhythm), T*, R*. Six Learn cards ("Ear", "Rhythm", "Triads", "Arpeggios", "Minor and function", "Scales") show "Coming soon".

### 1.1 Finding: harmony and progressions are not "open early" (highest impact)

The design (§5) and research/03 both say: *start C8–C10 early, in parallel with the fretboard work, because songs drive motivation.* The goal profile for "Play songs with friends" promotes Harmony, Progressions, Chords and Keys to the front of the Learn map. But the gates make that promise empty:

- `C8.numerals-major` needs `C5.triads` **and** `C4.flat-key-degrees` mastered.
- `C5.triads` needs four skills mastered: `C3.thirds`, `C3.fourths-fifths`, `C4.sharp-keys`, `C4.flat-keys` (which includes spelling C♭ and G♭ major).
- `C9.pop` needs `C8.numerals-major` mastered: 144 items at 7-day stability.
- `C10.capo-g-c-d` needs `C4.sharp-keys` and `C5.triads` mastered.

Each hard gate costs several days to a week (with the default FSRS parameters a card needs two or three spaced correct reviews before its stability reaches 7 days), and they chain. A realistic estimate for a 10-minute-a-day songs learner is **six to ten weeks before the first Roman numeral and two to three months before the first progression**. In the browser, this learner's Learn map opens with four padlocks and two "Coming soon" cards; the only open module, "Neck basics", is below the fold. That is the opposite of what the goal step promised ("Your goal decides which topics come next").

The over-gating is also not what rule 7 asks for. Rule 7 gates *intervals → chord construction* and *chord construction → progressions*. It does not gate chord spelling on flat-key spelling, nor numerals on every degree of every flat key. The chain in code is stricter than the rule and far stricter than the research's recommended order (F1–F3 → C1–C2 with C3 → C4–C5 → **C8–C10 early, in parallel**).

**Recommendation (WP-A, below).** Build a *songs on-ramp*: stage C8 by key group and open the first stage softly. Concretely:

- Split `C8.numerals-major` (144 items) into `C8.numerals-c-g-d` (C, G, D: 18 numeral cards each way), `C8.numerals-a-e-f` and `C8.numerals-rest`. The first stage soft-unlocks on `C4.sharp-keys` practising and `C5.triads` practising (not mastered). Later stages gate on the stage before, and the last on `C4.flat-key-degrees` mastered, which is where that prerequisite belongs.
- `C9.pop` soft-unlocks on the first C8 stage practising, scoped to those keys at scope level 0.
- `C5.triads` gates on `C3.thirds` mastered and `C4.sharp-keys` practising only. Flat keys and 4ths/5ths are not needed to spell a major or minor triad in the keys a beginner plays in; `C5.sevenths` already gates on `C3.sevenths`.
- `C10.capo-g-c-d` soft-unlocks on `C5.triads` practising. A capo question needs only "which key sounds", not mastered triad spelling.
- Document the deviation from the current gate comments in `docs/progress.md`, as `CLAUDE.md` asks.

### 1.2 Finding: the frontier is a strict queue, so parallel tracks starve

`orderFrontier` sorts skills by goal-promoted module, then `order`, and `buildSession` takes new items from that list front to back until the session is full. Two consequences:

- **For "general" and "improvise" learners**, C1 (186 items) and C2 (120 items) sit at orders 1100–1200, ahead of C3 (1300) and C4 (1400). Nothing from intervals or keys enters a session until about 300 octave and note items have been introduced. At the roughly 15–20 new items the builder loads per 10-minute session (see 1.4), that is three to four weeks of nothing but notes and octaves, which is exactly the "plateau" research/03 warns about.
- **For "songs" and "jazz" learners**, the *Keys* module (C4 **and I3**, 159 + 59 items) is promoted ahead of the neck. From day two or three they spell C♯ major and recite key signatures before they can name fret 5 on string 5. I3 is an *Intermediate* topic in research/03 and should not sit inside the first promoted module.

The design's own words are "M-Harmony and M-Progressions open early, **in parallel**" and the Ear and Rhythm tracks are "parallel" and "from day one". The builder has no notion of parallel lanes.

**Recommendation (WP-B).** Give the session builder two or three *lanes*: new items are drawn round-robin from the first unlocked skill of up to three modules (primary = first goal-promoted open module; secondary = first open neck module; tertiary = a parallel track such as Ear or Rhythm once they exist). A ratio such as 2:1:1 keeps the goal first without starving the rest. Keep the per-lane order as it is. Add `lanes` to `engine/config/session.ts`. Move I3 out of the Keys module into its own module placed after Harmony (or keep it in Keys but with `order` after C8), so key signatures are not front-loaded.

### 1.3 Finding: C2 is one 120-item skill; the Learn ring reads 0% for weeks

`C2.all-notes` holds every note on strings 1–4 plus the accidentals on 6 and 5, in both directions. Mastery needs 108 of 120 items stable. Its ring will read "0% stable" for a month, the "Whole neck" achievement is the only milestone, and research/03's weak-cell targeting (frets 7–12 on the middle strings) has no skill-level expression. F2 shows the better pattern: one skill per string.

**Recommendation (WP-C).** Split C2 into `C2.string4-naturals`, `C2.string3-naturals`, `C2.string2-naturals`, `C2.string1-naturals` (soft on F2 practising, in that order; string 1 can note that it repeats string 6), then `C2.accidentals-6-5`, `C2.accidentals-4-1`. Keep item IDs, so existing cards migrate by `skillId` only (a schema version that remaps `skillId`, as v3 did for the tones stages). Add "String 4/3/2/1 master" achievements to match "String 6/5 master".

### 1.4 Finding: the first session is too big and too mixed

On day one, four skills are unlocked with no prerequisites (F1.alphabet, F2 string 6, F2 string 5, F3.markers), and `buildSession` fills every free slot with new blocks: a 10-minute session is 86 prompts, with nothing due, so about 20 new items × (worked example + 3 reps). Yet the daily quest says "Learn **3** new items", and research/02 rule 6 says "block new items briefly (3–5 reps), then interleave", which assumes a modest number of new items among reviews. Twenty new facts in one sitting from four different skills, all with the help panel open, is a cram.

**Recommendation (WP-D).** Add `maxNewPerSession` to `engine/config/session.ts` (suggest 8 at 10 minutes, scaled by minutes, and raised by the adaptive band when accuracy is above 92%), and fill the remaining slots with stretch items from the current skills rather than more new blocks. Order day one deliberately: F2 string 6 landmarks first (concrete, on the neck, has a worked example), F1 alphabet alongside, F2 string 5 and F3 the next day.

### 1.5 Finding: the ear and rhythm tracks are missing, and the map shows it

Research/02 rule 13 and research/03 both put I6 ear drills "from day one", and F4 rhythm is a parallel track. M4-07/08 (I6, D14, D15) and M6-08 (F4, D20) are open and blocked. Until they exist, a third of the Learn map is "Coming soon", and the songs goal's promoted list ends in two empty modules.

**Recommendation.** Treat M4-07 (I6 + D14) as the next content priority after the gating fixes; it is the cheapest way to make the first weeks feel musical (hear I–V–vi–IV, hear a major vs minor triad) while the learner is still drilling notes. In the meantime (WP-E) collapse "Coming soon" modules into one row at the bottom of the map, so the first screen shows open work.

### 1.6 Finding: "Locked: preview" previews nothing

Locked skills say "Preview only", but a locked skill has no content except its title unless it happens to have a worked example (nine do, see §2). "Preview" promised something to look at; most of the time there is nothing. Either give every skill a concept card (§2) or change the label to "Locked" with the unlock rule, which is already well written ("It joins your sessions once you're practising …").

### 1.7 Finding: placement and test-out cover the wrong set for an experienced player

Placement probes F1, F2, C2, C3, C4, C5, C8. It skips F3, C1, C6, C7, C10 and I3. A player who already knows CAGED and the pentatonic boxes cannot place out of them, and test-out is per module. C1 (octave shapes) in particular is a two-probe topic and cheap to include. Suggest adding C1 and C6 (triad cores) probes, and letting test-out be offered from the Learn map header for every locked module in one run.

### 1.8 Smaller path points

- `C3` groups go 3rds → 4ths/5ths → 7ths → 6ths → 2nds. Sensible (chord tones first). But the C3 worked example covers only major 3rds across the G–B shift; the 4ths/5ths group, which is where the G–B shift bites hardest (the "one fret up" rule), has none.
- `I3.dominants` and `I3.relative-minors` are useful for C8 (the V and the vi). They currently sit before C8 in the frontier but C8 does not reference them. Consider making I3.dominants a soft prerequisite of the first C8 stage so "the V of G is D" is met before "V in G is D".
- `C7.minor-boxes` is a HARD gate on `C6.minor-shapes`. For the "improvise" goal, which promotes Pentatonic first, that means weeks of CAGED before a box. Research/03 says boxes link *to* CAGED, but a blues learner can play box 1 before knowing the E-shape. Suggest soft on `C6.minor-cores` practising.
- `C6.triad-cores` needs `C5.triads` *mastered* (spelling 24 triads at 7-day stability). The research says "start CAGED from partial shapes and triads"; practising is enough.
- Achievements: 8 exist, all notes or streaks. The design lists "All 5 CAGED shapes of G", "Ear: I–V–vi–IV" and "Speed demon". Chords, CAGED, harmony and progressions have no competence milestone, so the mastery-map motivation (rule 15) stops at the neck.

---

## 2. Does the wording make sense?

Mostly yes. The copy is honest, British, unpatronising, and the evidence is explained without overclaiming (About was checked claim by claim against research/02; nothing is unsupported). The session summary and the "Short and often" panel do rule 11 well. The test-out card is a model of unlock copy. The problems are of four kinds.

### 2.1 Nothing explains what a skill is or why it matters

`Skill` has a `title` and nothing else (`engine/model.ts`). A skill row on Learn reads "Whole steps · F1 · Ready · 0 learning · 0 stable of 14" (`screens/learn/SkillDetail.tsx:64-70`): a raw topic code, two undefined words and four numbers. Module summaries are tables of contents ("Interval shapes from m2 to P8 and the G–B +1 fret shift"), not outcomes, and "m2 to P8" is jargon for the module that teaches intervals. No module or skill says what the learner will be able to *do*, although research/03 has a "Learner can DO" column for every topic that could be lifted straight in.

### 2.2 Wrong-answer feedback often marks, rather than teaches

Several drills rely only on the shared bar `That was {expected}. You'll see it again shortly.` (`session/SessionScreen.tsx:296-298`). In the browser the first wrong answer a beginner can give ("the note after C?" → E) produced exactly that: "That was D." No "the alphabet runs A B C D E F G and starts again". Research/03 says feedback should target the misconceptions, and the drills that do so are the strong ones. By drill:

| Feedback teaches a method | Feedback only states the answer |
|---|---|
| D7 spell-it (`Right pitch, wrong letter: …`), D11 numerals (`Right root, wrong quality: …`), D12 (`You built vi–IV–I–V: the same chords as I–V–vi–IV, started from the vi`), D13 capo (`A capo shortens the strings, so it raises the pitch: count up`), D38 build-the-chord, D4, D6 (the G–B rule), D36, D37, D40 | **D1 name-the-note**, **D3 note-wheel**, **D5 interval-name**, **D39 fret-landmarks** (bar only); D2, D8, D16, D17 (say where, not how) |

The weak column is the *first* material a beginner meets (F1, F2, F3). That is where "no sharp between B–C and E–F" and "don't count from the nut" need saying at the moment of the slip.

### 2.3 The in-session "worked example" shows the answer, not the method

A new item's first rep is `guided: true`, which means guide level 3 and a prompt such as "This is F♯. Tap F♯ to continue." (`drills/d1-name-the-note/D1View.tsx:83`) or "The note after C in the musical alphabet is D. Tap D to continue." That is an answer to copy, not a worked example in Renkl's sense (rule 8: worked → faded → independent). The Learn-screen `WorkedExample` component does this properly (idea line, three fading steps, a trap), but only 9 examples exist and they are not shown in sessions. 36 of 52 skills have none, including **all four F1 skills**, F2 string 5, F3, four of five C3 groups, all of I3, C7, C8, C9 and C10.

### 2.4 Terminology drifts

- **Accidentals.** D1, D2, D3, D4, D16 and the feedback bar print ASCII `F#` / `Bb` (from `chromaToPc`); every later drill prints `F♯` / `B♭`. The first five drills a beginner meets are the inconsistent ones. Degrees likewise: `b3`/`b7` in D6 labels and D7's panel (`Bm7 = 1 b3 5 b7`), `♭3`/`♭7` in D8, D9, D17, D36–D38, and `b7` in the Chords module callout (`engine/frontier.ts:70`).
- **Interval names.** D5 buttons are `M3 m3 P5 TT`; D6, D36 and D40 say "major 3rd", "perfect 5th". Only D5's worked example bridges the two.
- **W W H.** D7 says "Steps from the tonic: W W H W W W H" without ever expanding W and H; D17 does ("Whole and half steps").
- **The thing you learn** is a "note" (Today: "New notes waiting", which counts alphabet and marker items), an "item" (quests, summary), a "fact" (Progress forecast, placement) or a "card".
- **Learning / stable / known / mastered** are defined once, in muted text at the foot of the module detail, and used on every card, tile and summary.
- **Progress topic names ≠ Learn names**: "Notes and steps" vs "Neck basics", "Chord building" vs "Chords", "Diatonic harmony" vs "Harmony", "Ear training" vs "Ear" (`screens/progress/panels/topics.tsx:15-37` vs `engine/frontier.ts`).
- **Direction words.** "up the neck", "toward the nut", "higher", "2 strings up" (meaning toward string 1). Only D10 defines its term ("Up the neck is toward the body").
- **Two "goals"**: the play goal and the daily goal. Learn's "Ordered for your goal" could mean either.
- **Engineering leaks**: "Builds on: The musical alphabet (and, softly, octaves)"; "Its skills start feeding your sessions"; topic codes "F1", "C5" on every skill row.
- **Stale pointers**: the welcome screen says settings can be changed "later in Progress" (`onboarding/OnboardingFlow.tsx:104`); Settings has been its own section since 2026-10-18. The Reading-music step promises "its reading track moved up" for a track that is "Coming soon".
- Mic copy differs between the two mic drills in every message (blocked, unsupported, starting, privacy).

The two audits' full per-drill and per-screen tables, with file:line references for every string, are in `docs/review/2026-10-20-copy-audit-drills.md` and `docs/review/2026-10-20-copy-audit-screens.md`.

## 3. Will this help people learn?

For the engine's part, yes, and better than any app in research/01: recall before reveal, FSRS, speed grading, interleaved confusables, fading guides, honest copy about why it feels hard. A learner who sticks with it will know the neck.

Whether they stick with it is the question, and three things work against it:

1. **The goal promise is broken on day one** (§1.1). A songs learner is shown four locked modules and two empty ones before anything they can do, and will not meet a chord progression for months. Duolingo-style motivation (§3.7) cannot carry that; competence feedback only works when the competence is one the learner wanted.
2. **The first weeks are facts without a frame** (§2.1–2.3). Recall works when there is something to recall; the app asks for the note after C before it has said the alphabet has seven letters and repeats. Rule 4 ("recall, never re-reading") is being read as "never explain". The research says worked example *then* recall.
3. **The help panel leaks the answer while nothing else explains.** During the F1 drill the note wheel shows every note in order with the start note highlighted, at every guide level until fading kicks in, so the "recall" is a lookup. Meanwhile the thing that would help, a sentence of concept, is absent. Help is pointed at the wrong layer.

Fix the gating, add a concept layer, and the rest of the design will do its job.

## 4. Where to give more help, and what

| Where | What | Why |
|---|---|---|
| First time a skill enters a session | A **concept card**: ≤ 40 words plus one neck or wheel diagram, dismissed by a tap, then the guided rep. One per skill, stored next to the skill (`engine/skills/<topic>.ts` gains `intro`, or a `learn/intros/` registry like worked examples). | Rule 8. The guided rep is faded practice, not the worked example; this is the missing first stage. |
| Skill and module rows on Learn | A one-line **outcome** ("Name any natural note on the low E string at a glance") lifted from research/03's "Learner can DO" column. | §2.1. Also makes "Locked: preview" show something. |
| Wrong answers in D1, D3, D5, D39 | A **method line** per drill, as D7/D11/D13 already do: D3 "The alphabet runs A B C D E F G, then A again"; D1 "G♯ is one fret above G; count from the open E: E F F♯ G G♯"; D5 "You chose a minor 3rd (3 half steps); C up to E is 4"; D39 "Count the dots from the nut: 3, 5, 7". | §2.2, research/03 misconceptions. |
| The note-wheel panel at guide levels ≤ 2 | Show the wheel's **structure** (12 dots, the ½ marks at B–C and E–F) without the note names. | Otherwise the panel is the answer key. |
| Learn and summary tiles | A **legend** where "learning" and "stable" first appear, and the same two words everywhere. | §2.4. |
| Today for a brand-new learner | One line: "Your first session is about 10 minutes and starts with the notes on the low E string." Hide the freezes line until one is held. | A day-one learner has nothing to go on but the button. |
| Explore | The **progression player** (M4-09, still todo) is the single Explore view a songs learner would use daily. The **metronome** (M8-20) is the Tools item a rhythm track needs. | Both are in the design; both are unbuilt. |
| Jargon on first use | A tooltip or inline gloss for *tonic, degree, quality, voicing, chord tone, relative minor, spell*: ("spell: its notes in order"). | §2.4. The audits list where each term first appears. |
| Multi-target drills (D4, D9, D37, pentatonic) | Say the rule once per prompt: "Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest." | Only D37's hint-less state says it today. |
| Achievements | Milestones for chords, CAGED, harmony and progressions ("All 5 CAGED shapes of G", "Three-chord songs in any key"). | Rule 15; today's eight are notes and streaks only. |

## 5. Proposed work packages (for the PM to file)

Ranked by learner impact. Each is sized for one worker and respects the "add files, don't edit hubs" convention where possible. None touches the engine's scheduling rules (rule 16).

| WP | Title | Scope | Size |
|---|---|---|---|
| **A** | Songs on-ramp: stage C8 and loosen the chord, capo and CAGED gates | Split `C8.numerals-major` into three key-group stages (C/G/D; A/E/F; the rest), first stage soft on `C4.sharp-keys` + `C5.triads` practising, last stage hard on `C4.flat-key-degrees`. `C9.pop` soft on the first stage. `C5.triads` hard on `C3.thirds` + soft on `C4.sharp-keys`. `C10.capo-g-c-d`, `C6.triad-cores` and `C7.minor-boxes` soft on the practising state of their chord prerequisite. Schema version remapping `skillId` for existing C8 cards. Record the deviation from the gate comments in `docs/progress.md`. Update the `unlocksAfter` strings and the test-out scopes. | M |
| **B** | Session lanes and a new-item cap | `engine/config/session.ts`: `maxNewPerSession` (8 at 10 min, scaled; raised by the adaptive band) and `lanes` (primary goal module : neck module : parallel track, 2:1:1). `buildSession` draws new blocks round-robin from lanes; `orderFrontier` returns lanes rather than one list. Move I3 after C8 in frontier order (own module "Key signatures", or `order` 1599.9). Unit tests on a 10-minute day-one session for each goal: no more than N new items, at least two modules represented once two are open. | M |
| **C** | Split C2 by string | Six skills replacing `C2.all-notes`, keeping item IDs; schema version remaps `skillId`; "String 4/3/2/1 master" achievements; Progress topic row per string. | S |
| **D** | Concept intros: a registry and the first ten | `learn/intros/` auto-registered like worked examples; a `ConceptCard` shown by the runner before a skill's first guided rep in a session (once per skill per device); hidden at `reviewOnly`. Write intros for F1 ×4, F2 ×2, F3 ×2, C1.octaves, C3.thirds. | M |
| **E** | Worked examples for the uncovered skills | F1 (one per skill, the trap being E–F / B–C), F3.markers, F3.repeat-12, C3.fourths-fifths (the G–B rule), C8 stage 1 (I IV V in C), C9.pop (rotation), C10 (count up), C7.minor-boxes. Pattern: `c5-root-first.tsx`. | M (can be split by topic) |
| **F** | Skill outcomes and module outcomes | `Skill.outcome` (one line, from research/03's DO column) rendered under the title; module `summary` rewritten as outcomes; drop the raw topic code from the skill row; "Builds on" strings in plain words; "Locked: preview" → "Locked" where there is nothing to preview. | S |
| **G** | Method-based wrong-answer feedback for D1, D3, D5, D39 | A `explain` line in each drill's `logic.ts` `check` result, rendered under the prompt as D6/D11 do; the F1 and F2 misconceptions named. Unit tests per misconception. | S |
| **H** | One vocabulary | ♯/♭ everywhere (a `displayPc` helper used by D1–D4, D16 and the feedback bar); `♭3`/`♭7` in D6, D7, the module callout; "item" for the unit everywhere (Today "New items waiting", Progress "facts", placement "facts"); one learning/stable legend component shown on Learn, the summary and Progress; Progress topic titles taken from the modules; mic copy shared between D16 and D17; "Up the neck is toward the body" defined once in a shared hint. | S |
| **I** | Copy fixes from the audits | Welcome "in Progress" → "in Settings"; Reading step "(coming later)"; "Fretting hand on the left" → "You fret with your left hand"; D7 "W W H" expanded; D40 prompts glossed; D36 "quality" → "type"; D38 notices; multi-target rules on every prompt; Speed demon baseline-relative; streak repair "restored shortly" → when; heatmap legend and cell detail in learner words; misconception callouts rewritten in the second person and added for Keys and Harmony. The full list with current and proposed strings is in the two audit files. | S |
| **J** | Note-wheel panel fades its names | At guide level ≤ 2 the wheel shows dots and the ½ marks only. | XS |
| **K** | Today's first-day line and freezes copy | Hero shows the first-session line when nothing has been practised; freezes line hidden until one is held, and explained when first shown. | XS |
| **L** | Placement probes for C1 and C6 cores; test-out from the map header | | S |
| **M** | Achievements for chords, CAGED, harmony, progressions | Mastery-tied, as `masteryAchievement` already supports. | S |

Already filed and raised in priority by this review: **M4-07** (I6 ear + D14) and **M4-09** (progression player) are the content gaps that matter most to the songs goal; **M6-08** (F4 rhythm) is the other day-one parallel track.

Suggested order: A, B, D, G, F, H, I together as a "learning-path" batch, then C, E, J, K, L, M.

## 6. What this review did not do

- It did not measure real learners. The time-to-harmony estimate in §1.1 is from the FSRS defaults (three correct spaced reviews before stability reaches 7 days) and the builder's intake rate, not from logs. The local review log (rule 17) could confirm it once there are users.
- It did not test the compact (iPhone) layouts or accessibility; the earlier QA packages cover those.
- It did not audit the theory itself (`theory/`); it is exhaustively tested and nothing in the copy contradicted it.
