# Research 2: Learning science and how it applies to this app

## Summary

The best-supported methods work for **everyone**, so they form the core of the app:

- **spaced retrieval practice**
- **interleaving similar, easily confused items**
- **fluency (speed) training**
- **adaptive difficulty**

**"Learning styles" (VARK) matching is not supported by evidence** (Pashler et al. 2008; Rogowsky et al. 2015). We personalise on things that genuinely differ between learners:

- prior knowledge (the expertise reversal effect)
- goals and genre
- time available
- whether they read notation or play by ear

There's almost no controlled research on fretboard learning itself. Choices like CAGED vs 3-notes-per-string (3NPS) are reasoned from general principles.

## Evidence base

| Principle | Key evidence | Strength |
|---|---|---|
| Spacing | Cepeda et al. 2006 (meta-analysis), 2008; Dunlosky et al. 2013 rate it "high utility" | Very strong |
| Retrieval practice / testing effect | Roediger & Karpicke 2006; Adesope et al. 2017 meta-analysis (g≈0.61) | Very strong |
| FSRS over SM-2 | open-spaced-repetition/srs-benchmark (~350M reviews); FSRS-6 is the default in Anki | Strong |
| Interleaving | Shea & Morgan 1979; Brady 2004 (d≈0.57 in lab, ~0.19 in applied settings); Brunmair & Richter 2019 (g≈0.42, largest for similar categories); Carter & Grahn 2016 (clarinettists) | Moderate–strong |
| Desirable difficulties | Bjork 1994; Bjork & Bjork 2011: learners misjudge blocked practice as better | Strong |
| Cognitive load, worked examples, fading | Sweller 1988; Sweller & Cooper 1985; Renkl (fading); Cowan 2001 (~4 chunks) | Strong |
| Expertise reversal | Kalyuga et al. 2003: guidance that helps novices hurts experts | Strong |
| Mastery learning | Bloom 1984 (2σ is inflated); Kulik 1990 (ES≈0.52); VanLehn 2011 (≈0.79) | Moderate–strong |
| Deliberate practice | Ericsson 1993. Critiques: Macnamara et al. 2014 (~21% of variance in music), 2016, 2019 | Useful but over-sold |
| Expert practice behaviour | Duke, Simmons & Cash 2009: find exact errors, fix them immediately, vary tempo | Moderate |
| Fluency / Precision Teaching | Lindsley; Binder 1996: speed frees working memory | Moderate (not music-specific) |
| ~85% success rate | Wilson et al. 2019, *Nat. Comms*: a model result, so treat as a tuning target | Theoretical |
| Feedback fading (guidance hypothesis) | Salmoni et al. 1984; Winstein & Schmidt 1990; **Keebler et al. 2014: Fretlight LED-guitar gains vanished** | Strong |
| Variable practice | Schmidt schema theory | Moderate |
| Mental practice | Driskell et al. 1994 (d≈0.53): weaker than physical practice but adds to it | Moderate |
| External focus | Wulf 2013, but McKay et al. 2024 find ≈0 after bias correction | **Low priority** |
| Gamification | Sailer & Homner 2020 (small effects); Deci et al. 1999 (rewards can undermine motivation); Hanus & Fox 2015 (leaderboards hurt) | Mixed |
| Self-determination theory | Ryan & Deci 2000: autonomy, competence, relatedness | Strong |
| Dual coding / multimedia | Paivio 1986; Mayer 2009 (helps everyone, not a "style") | Strong |
| Sound before symbol | Gordon's Music Learning Theory, Suzuki, Kodály: sensible pedagogy with limited controlled evidence | Weak–moderate |

## Design rules derived from the evidence (normative for the app)

1. **One card per atomic fact, scheduled with FSRS** (ts-fsrs, target retention 0.9). Cards are bidirectional: position→name and name→positions. Refit FSRS parameters per user after about 1,000 reviews.
2. **Grade from correctness and speed together.** Wrong = Again. Correct but slower than the target = Hard. Correct within the target = Good. Correct at well under the target = Easy.
3. **Personal speed targets.** First calibrate the learner's baseline tap/answer latency. Initial target = baseline + 2.0s; fluent target = baseline + ~1.0s. Both are tunable.
4. **Recall, never re-reading.** Every interaction asks for an answer before revealing it.
5. **Hold accuracy at 80–90% by adapting scope:** fret range, strings, distractors, time limit. Widen above 92%, narrow below 75%.
6. **Block new items briefly (3–5 reps), then interleave.** Deliberately mix confusable pairs: E/F, B/C, major/minor, CAGED C vs A shapes.
7. **Gate on mastery:** natural notes on strings 6 and 5 → CAGED; intervals → chord construction; chord construction → progressions.
8. **Worked example → faded → independent** for each new concept.
9. **Fade visual guidance** (dots, labels, inlays) within and across sessions. Keep immediate correct-answer feedback for factual recall.
10. **Sound + visual + name on every item.** The mic mode (play it on a real guitar) is the motor-transfer drill.
11. **Short daily sessions (5–15 min).** Explain spacing to users who try to cram.
12. **Vary context:** the same shape in many keys and neck positions.
13. **Ear-to-fretboard drills:** hear it → find it.
14. **Optional mental-practice drills** for when the guitar isn't to hand.
15. **Motivation through visible competence:** fretboard mastery heatmaps, retention forecasts. Forgiving streaks with freeze days. No public leaderboards.
    _Product decision (2026-10-18): the user chose Duolingo-style gamification (streaks, XP, daily goal, achievements, quests). It is adopted with guardrails that keep it consistent with this rule; see design §3.7. Leagues are opt-in only, and there are no hearts or lives._
16. **Learner choice** of goals, genres and session length, but never a choice that disables spacing or retrieval.
17. **Log reviews locally** so the thresholds can be tuned and A/B tested.

## Personalisation: what we do instead of "learning styles"

- **Placement test:** a ~3-minute adaptive diagnostic that seeds FSRS states and skips known material.
- **Goal / genre pick:** rock-blues, pop/singer-songwriter, jazz, or general. This reorders modules and picks example progressions and repertoire.
- **Notation preference:** none, tab, or standard notation.
- **Daily time budget:** 5, 10 or 15 minutes.
- **Entry point:** ear players can start with ear→fretboard drills; readers add staff↔fretboard drills.
- **Automatic scaffolding adjustment** driven by performance (expertise reversal).
- **Honest copy in the app:** "This adapts to what you know and what you want, not to a 'learning style'. That's what the evidence supports."
