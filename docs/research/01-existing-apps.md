# Research 1: Existing open-source apps and reusable libraries

_Researched 2026-10-18 (GitHub metadata via `gh`, plus web search)._

## Verdict

**No open-source app is suitable to adopt or fork.** None covers all four core features (fretboard notes, CAGED, chord building, progressions) with an evidence-based practice loop such as spaced repetition. Most repos are visualisers with no practice loop, or single-skill quiz toys. The closest match has no licence, so it can't legally be forked.

**Decision: build our own mobile-first PWA** on mature MIT/ISC/0BSD libraries. A Capacitor wrapper can be added later for an App Store build.

## Candidate apps

| App | Licence | Activity | Platform | Notes | CAGED | Chords | Progressions | SRS |
|---|---|---|---|---|---|---|---|---|
| [dknathalage/guitar-learning-tools](https://github.com/dknathalage/guitar-learning-tools) | **none** | 2026-03, 4★ | SvelteKit | quiz + mic | visual only | speller | intervals | **FSRS, BKT, IRT** |
| [mikehadlow/gtr-cof](https://github.com/mikehadlow/gtr-cof) (Guitar Dashboard) | MIT | 2026-04, 376★ | Web SPA | display | partial | display | circle of fifths | no |
| [cheap-glitch/fretboarder](https://github.com/cheap-glitch/fretboarder) | MPL-2.0 | dormant 2023 | Web | display | no | arpeggios | scales | no |
| [jherrlin/guitar-theory-training](https://github.com/jherrlin/guitar-theory-training) | none | 2023 | ClojureScript | some | no | yes | some | no |
| [ShacharHarshuv/open-ear](https://github.com/ShacharHarshuv/open-ear) (OpenEar) | MIT (F-Droid) | 2026-09, 184★ | Ionic/Capacitor, on the iOS App Store | no | no | chord function by ear | **yes (ear)** | adaptive |
| [TheAngularGuy/guitar-fretboard-learning](https://github.com/TheAngularGuy/guitar-fretboard-learning) | none | 2024 | Ionic, on the iOS App Store | game | no | no | no | no |
| [bragefuglseth/fretboard](https://github.com/bragefuglseth/fretboard) (GNOME) | GPL-3.0 | active | GTK desktop | no | no | chord lookup | no | no |
| Fretonomy, FretXMaster, Fret Pro | proprietary | — | — | — | — | — | — | — |

Ideas worth borrowing (design, not code):

- **dknathalage:** the shape of its learning engine (FSRS plus coverage, confusion and fatigue tracking) and its YIN pitch detection in an AudioWorklet.
- **OpenEar:** its progression and Roman-numeral ear exercises.
- **Guitar Dashboard:** its circle-of-fifths and diatonic-chord views.

## Libraries to build on

| Library | Purpose | Licence | Status |
|---|---|---|---|
| **tonal** | Theory: notes, intervals, scales, chords, keys, Roman numerals | MIT | very active, 4.3k★ |
| **ts-fsrs** | FSRS-6 spaced-repetition scheduler | MIT | very active |
| **pitchy** | Mic pitch detection (McLeod method) | 0BSD | active |
| **Tone.js** | Audio playback and synthesis | MIT | very active |
| **svguitar** | SVG chord diagrams | MIT | very active |
| **chords-db** | Guitar chord voicing database | MIT | active |
| react-guitar / fretboard.js | Fretboard rendering, for reference | MIT / ISC | ok / stale |
| pitchfinder | YIN and other pitch algorithms | **GPL-3, avoid** | — |

Native-Swift equivalents, if we ever go native: cemolcay/MusicTheory, AudioKit, swift-fsrs (all MIT).

We'll write our own SVG fretboard component rather than adopt one. That gives full control over touch targets, iPhone landscape zoom, left-handed mode and guide fading.
