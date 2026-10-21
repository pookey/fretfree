import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import { AUDIO } from '../../../audio/config';
import type { StrumPatternName } from '../../../audio/progression';
import {
  Fretboard,
  type FretMarker,
  type MarkerStyle,
} from '../../../components/fretboard/Fretboard';
import {
  SKILLS,
  isFrontier,
  progressionItemId,
  type Skill,
  type SkillStatus,
} from '../../../engine';
import { focusHref, nearestOpenSkills, type SessionFocus } from '../../../session/focus';
import {
  PROGRESSIONS,
  STANDARD_TUNING,
  capoOptions,
  chordTones,
  chromaOf,
  chromaToPc,
  getProgression,
  getTuning,
  noteAt,
  progressionChords,
  relativeKey,
  shapeKey,
  standardKeyTonic,
  type ChordDegree,
  type ChordKind,
  type ChordQuality,
  type ChordSpec,
  type DiatonicChord,
  type FretRange,
  type KeyMode,
  type MusicalKey,
  type Progression,
  type Tuning,
} from '../../../theory';
import { placements, templatesFor, type PlacedNote } from '../../../theory/voicings';
import styles from '../../screens.module.css';
import { Swatch, useSkillStatuses } from './fretboard-explorer';
import css from './fretboard-explorer.module.css';
import own from './progression-player.module.css';

/**
 * Progression player (design §7 Explore): pick a progression from the C9
 * catalogue and a key, see its chart and hear it loop on the Tone Transport
 * (M4-06 `playProgression`), with the chord playing marked as it sounds.
 * The chart reads as chord names, Roman numerals or Nashville numbers, so a
 * progression's function and its chords are seen together (research/02
 * rule 10), and moving to another key shows the numerals staying put.
 *
 * The capo works like the capo calculator (C10): the key is what sounds; with
 * a capo the chart shows the shapes to finger, and what each one sounds as.
 * The neck shows the open-position voicing of the chord in play.
 *
 * Reference only, no grading. "Quiz me on this" opens a focused session on
 * the progression's C9 skill (plus C10 with a capo on), so it is recalled,
 * not just replayed (rule 4).
 */

/**
 * The audio module, imported on demand: a static import from this lazy view
 * splits the shared first-load code into extra chunks. It is in the
 * first-load graph anyway, so this fetches nothing.
 */
const loadAudio = () => import('../../../audio/audio');

/** The neck: open position up to the 12th fret, which a capo-7 barre still fits. */
export const PLAYER_RANGE: FretRange = { from: 0, to: 12 };
export const MAX_CAPO = 7;
export const TEMPO = { min: 50, max: 160, step: 5 } as const;
/** Milliseconds a change waits before a playing loop restarts with it (a tempo drag). */
const RESTART_MS = 250;

export type ChartLabels = 'chords' | 'roman' | 'nashville';

const LABEL_MODES: readonly { mode: ChartLabels; label: string }[] = [
  { mode: 'chords', label: 'Chords' },
  { mode: 'roman', label: 'Numerals' },
  { mode: 'nashville', label: 'Nashville' },
];

const PATTERNS: readonly { id: StrumPatternName; label: string }[] = [
  { id: 'once', label: 'One strum a bar' },
  { id: 'quarters', label: 'Every beat' },
  { id: 'eighths', label: 'Down-up eighths' },
  { id: 'folk', label: 'Folk: D, DU, UDU' },
];

/** Display form: `F#m` → `F♯m`, `Bb7` → `B♭7`, `i–bVII` → `i–♭VII`, `b7` → `♭7`. */
export function pretty(text: string): string {
  return text
    .replace(/#/g, '♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/(^|[^A-Za-z])b(?=[IViv1-7])/g, '$1♭');
}

export function keyTitle(key: MusicalKey): string {
  return `${pretty(key.tonic)} ${key.mode}`;
}

/** The twelve keys of a mode, by chroma from C, spelled as the circle of fifths names them. */
export function keyChoices(mode: KeyMode): MusicalKey[] {
  return Array.from({ length: 12 }, (_, chroma) => ({
    tonic: standardKeyTonic(chroma, mode),
    mode,
  }));
}

/**
 * The key to keep when the progression changes: itself if the mode agrees,
 * otherwise its relative, so the key signature stays (C major → A minor).
 */
export function keyForProgression(key: MusicalKey, progression: Progression): MusicalKey {
  if (key.mode === progression.mode) return key;
  const rel = relativeKey(key);
  return { tonic: standardKeyTonic(chromaOf(rel.tonic), rel.mode), mode: rel.mode };
}

const VOICED: Partial<Record<ChordQuality, ChordKind>> = {
  major: 'major',
  minor: 'minor',
  dominant7: '7',
  major7: 'maj7',
  minor7: 'm7',
  'half-diminished7': 'm7b5',
};

/**
 * The voicing nearest the nut of a chord, from the movable CAGED shapes: the
 * open chords where they exist (G 320003, Am x02210), barre chords otherwise
 * (F, B♭). Lowest top fret wins, then the fuller chord. Null for a chord
 * with no movable shape here, or none within `maxFret`.
 */
export function openVoicing(
  chord: ChordSpec,
  tuning: Tuning = STANDARD_TUNING,
  maxFret = PLAYER_RANGE.to,
): PlacedNote[] | null {
  const kind = VOICED[chord.quality];
  if (!kind) return null;
  let best: PlacedNote[] | null = null;
  let bestTop = Infinity;
  for (const t of templatesFor(kind)) {
    for (const p of placements(t, chord.root, tuning, maxFret)) {
      const top = Math.max(...p.map((n) => n.fret));
      if (top < bestTop || (top === bestTop && best && p.length > best.length)) {
        best = p;
        bestTop = top;
      }
    }
  }
  return best;
}

/** A close-position chord from octave 3, for a chord with no voicing: `C3 E3 G3`. */
export function closeVoicing(chord: ChordSpec): string[] {
  const root = 48 + chromaOf(chord.root);
  let prev = root - 1;
  return chordTones(chord).map((pc) => {
    let midi = root + ((chromaOf(pc) - chromaOf(chord.root) + 12) % 12);
    while (midi <= prev) midi += 12;
    prev = midi;
    return `${chromaToPc(midi % 12, 'sharp')}${Math.floor(midi / 12) - 1}`;
  });
}

export interface PlayerChord {
  /** `V`, `♭VII` before `pretty`: the chord's function, the same in every key. */
  readonly roman: string;
  readonly nashville: string;
  /** The chord to finger: the sounding chord, or the capo's shape. */
  readonly shape: DiatonicChord;
  /** The chord that sounds. */
  readonly sounding: DiatonicChord;
  /** The shape's frets without the capo; null when it has no voicing here. */
  readonly voicing: readonly PlacedNote[] | null;
  /** Sounding pitches, low to high, for playback. */
  readonly notes: readonly string[];
}

/** A progression's chart in a (sounding) key, fingered as shapes under a capo. */
export function playerChart(
  progression: Progression,
  key: MusicalKey,
  capo = 0,
  tuning: Tuning = STANDARD_TUNING,
): PlayerChord[] {
  const sounding = progressionChords(key, progression);
  const shapes = progressionChords(capo ? shapeKey(key, capo) : key, progression);
  return shapes.map((shape, i) => {
    const sound = sounding[i] as DiatonicChord;
    const voicing = openVoicing(shape, tuning, PLAYER_RANGE.to - capo);
    const notes = voicing
      ? voicing
          .map((n) => noteAt({ string: n.string, fret: n.fret + capo }, tuning))
          .sort((a, b) => a.midi - b.midi)
          .map((n) => n.name)
      : closeVoicing(sound);
    return {
      roman: shape.roman,
      nashville: shape.nashville,
      shape,
      sounding: sound,
      voicing,
      notes,
    };
  });
}

/** What a chart card shows first, by label mode. */
export function chartLabel(chord: PlayerChord, labels: ChartLabels): string {
  if (labels === 'roman') return pretty(chord.roman);
  if (labels === 'nashville') return pretty(chord.nashville);
  return pretty(chord.shape.symbol);
}

/** The card's second line: the numeral under a chord name, the chord under a numeral. */
export function chartSubLabel(chord: PlayerChord, labels: ChartLabels): string {
  return labels === 'chords' ? pretty(chord.roman) : pretty(chord.shape.symbol);
}

function degreeStyle(degree: ChordDegree): MarkerStyle {
  if (degree === '1') return 'root';
  if (degree === '3' || degree === 'b3') return 'third';
  if (degree === '5' || degree === 'b5' || degree === '#5') return 'fifth';
  if (degree === '7' || degree === 'b7' || degree === 'bb7') return 'seventh';
  return 'tone';
}

/** The chord's voicing on the neck, capo applied, each note named as the sounding chord spells it. */
export function chordMarkers(
  chord: PlayerChord,
  capo = 0,
  tuning: Tuning = STANDARD_TUNING,
): FretMarker[] {
  const spelled = new Map(chordTones(chord.sounding).map((pc) => [chromaOf(pc), pc]));
  return (chord.voicing ?? []).map((n) => {
    const pos = { string: n.string, fret: n.fret + capo };
    const pc = noteAt(pos, tuning).pc;
    return { ...pos, style: degreeStyle(n.degree), label: pretty(spelled.get(chromaOf(pc)) ?? pc) };
  });
}

/**
 * "Quiz me on this" (design §7): the C9 skill that teaches this progression,
 * plus the C10 capo skills when a capo is on. Gating stays on (rule 7), so
 * until those are open the quiz walks back through the gates each still
 * waits for (`statuses`, M10-02) and offers the nearest open ones: triads or
 * C8's numerals for C9, the keys and triads for C10.
 */
export function playerQuizFocus(
  progressionId: string,
  capo: number,
  statuses: ReadonlyMap<string, SkillStatus> = new Map(),
  skills: readonly Skill[] = SKILLS,
): Partial<SessionFocus> {
  const frontier = new Set(
    skills.filter((s) => isFrontier(statuses.get(s.id) ?? 'locked')).map((s) => s.id),
  );
  const item = progressionItemId(progressionId, 'build');
  const c9 = skills
    .filter((s) => s.topic === 'C9' && s.items().some((i) => i.id === item))
    .map((s) => s.id);
  // Each part walks back on its own, so an open C9 skill can't hide C10's
  // prerequisites, nor an open C10 skill C9's.
  const progression = nearestOpenSkills(c9, frontier, skills, statuses) ?? c9;
  const c10 = skills.filter((s) => s.topic === 'C10').map((s) => s.id);
  const capoPart = capo > 0 ? (nearestOpenSkills(c10, frontier, skills, statuses) ?? []) : [];
  return { skillIds: [...new Set([...progression, ...capoPart])] };
}

const LEGEND: Partial<Record<MarkerStyle, string>> = {
  root: 'Root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
};

export function View() {
  const settings = useAppStore((s) => s.settings);
  const tuning = getTuning(settings.tuning);
  const [progressionId, setProgressionId] = useState('I-V-vi-IV');
  const progression = getProgression(progressionId);
  const [key, setKey] = useState<MusicalKey>({ tonic: 'C', mode: 'major' });
  const [capo, setCapo] = useState(0);
  const [labels, setLabels] = useState<ChartLabels>('chords');
  const [bpm, setBpm] = useState<number>(AUDIO.progression.bpm);
  const [pattern, setPattern] = useState<StrumPatternName>('once');
  const [loop, setLoop] = useState(true);
  const [picked, setPicked] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const labelGroup = useId();
  const tempoId = useId();
  const statuses = useSkillStatuses();
  const quizHref = focusHref(playerQuizFocus(progressionId, capo, statuses));

  const chart = useMemo(
    () => playerChart(progression, key, capo, tuning),
    [progression, key, capo, tuning],
  );
  // A cue from before a progression change can point past the new chart until the restart.
  const shown =
    playing && current !== null && current < chart.length
      ? current
      : Math.min(picked, chart.length - 1);
  const chord = chart[shown] as PlayerChord;
  const markers = chordMarkers(chord, capo, tuning);
  const legend = (['root', 'third', 'fifth', 'seventh'] as const).filter((s) =>
    markers.some((m) => m.style === s),
  );
  const shapes = capo ? shapeKey(key, capo) : key;
  const suggestions = capoOptions(key, { maxCapo: MAX_CAPO });

  /** Everything a run plays; a change to it while playing restarts the run. */
  const signature = `${chart.map((c) => c.notes.join(' ')).join('|')}@${bpm}/${pattern}/${loop}`;

  // Playback. Each start takes a ticket; cues and endings from an older one are ignored.
  const run = useRef(0);
  const live = useRef<{ stop(): void } | null>(null);
  const pending = useRef(false);
  /** What the playing run plays, so only a real change restarts it. */
  const playingWith = useRef('');

  const finish = () => {
    live.current = null;
    pending.current = false;
    setPlaying(false);
    setCurrent(null);
  };

  const start = async () => {
    const mine = ++run.current;
    pending.current = true;
    playingWith.current = signature;
    setPlaying(true);
    setCurrent(null);
    const audio = await loadAudio();
    if (mine !== run.current) return;
    const playback = await audio.playProgression(
      chart.map((c) => ({ notes: c.notes })),
      {
        bpm,
        pattern,
        loop,
        volume: settings.volume,
        onChord: (i) => {
          if (mine === run.current) setCurrent(i);
        },
        onEnd: () => {
          if (mine === run.current) finish();
        },
      },
    );
    // Stopped, or restarted, while it was starting.
    if (mine !== run.current) return playback.stop();
    pending.current = false;
    // Overtaken by another start elsewhere, or audio refused: it never calls onEnd.
    if (!playback.started) return finish();
    live.current = playback;
  };

  const stop = () => {
    run.current++;
    live.current?.stop();
    // Cancel a start still waiting on the audio unlock.
    if (pending.current) void loadAudio().then((audio) => audio.stopAudio());
    finish();
  };

  // A change while it plays restarts the loop with it, once a tempo drag settles.
  const restart = useEffectEvent(() => {
    if ((live.current || pending.current) && playingWith.current !== signature) void start();
  });
  useEffect(() => {
    const t = setTimeout(restart, RESTART_MS);
    return () => clearTimeout(t);
  }, [signature]);

  // Leaving the view stops the music (M4-06 review).
  useEffect(
    () => () => {
      run.current++;
      live.current?.stop();
      if (pending.current) void loadAudio().then((audio) => audio.stopAudio());
    },
    [],
  );

  const pick = (i: number) => {
    setPicked(i);
    if (playing) return;
    const notes = chart[i]?.notes ?? [];
    void loadAudio().then((audio) =>
      audio.strum(notes, { muted: !settings.soundOn, volume: settings.volume }),
    );
  };

  const changeProgression = (id: string) => {
    const next = getProgression(id);
    setProgressionId(id);
    setKey(keyForProgression(key, next));
    setPicked(0);
  };

  return (
    <>
      <div className={css.controls}>
        <label className={css.field}>
          <span>Progression</span>
          <select value={progressionId} onChange={(e) => changeProgression(e.target.value)}>
            {PROGRESSIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {pretty(p.name)}
              </option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>Key</span>
          <select
            value={chromaOf(key.tonic)}
            onChange={(e) =>
              setKey({ tonic: standardKeyTonic(Number(e.target.value), key.mode), mode: key.mode })
            }
          >
            {keyChoices(key.mode).map((k) => (
              <option key={k.tonic} value={chromaOf(k.tonic)}>
                {keyTitle(k)}
              </option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>Capo</span>
          <select value={capo} onChange={(e) => setCapo(Number(e.target.value))}>
            {Array.from({ length: MAX_CAPO + 1 }, (_, fret) => (
              <option key={fret} value={fret}>
                {fret === 0 ? 'No capo' : `Fret ${fret}`}
              </option>
            ))}
          </select>
        </label>
        <fieldset className={css.segmented}>
          <legend>Show</legend>
          {LABEL_MODES.map((m) => (
            <label key={m.mode}>
              <input
                type="radio"
                name={labelGroup}
                value={m.mode}
                checked={labels === m.mode}
                onChange={() => setLabels(m.mode)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </fieldset>
        <Link to={quizHref} className={`${styles.secondaryButton} ${css.quiz}`}>
          Quiz me on this
        </Link>
      </div>

      <div className={css.summary}>
        <h2 className={css.name} data-testid="player-title">
          {pretty(progression.name)} in {keyTitle(key)}
        </h2>
        <p className={styles.muted}>{progression.description}</p>
      </div>
      {capo > 0 && (
        <p className={own.capoLine} data-testid="player-capo">
          Capo on fret {capo}: play {keyTitle(shapes)} shapes, sounding {keyTitle(key)}.
        </p>
      )}

      <ol
        className={own.chart}
        aria-label={`Chart of ${pretty(progression.name)}`}
        data-bars={chart.length}
      >
        {chart.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              className={own.card}
              aria-current={i === shown ? 'step' : undefined}
              data-playing={(playing && i === current) || undefined}
              data-testid="player-chord"
              onClick={() => pick(i)}
            >
              <span className={own.main}>{chartLabel(c, labels)}</span>
              <span className={own.sub}>{chartSubLabel(c, labels)}</span>
              {capo > 0 && <span className={own.sounds}>sounds {pretty(c.sounding.symbol)}</span>}
            </button>
          </li>
        ))}
      </ol>

      <div className={own.transport}>
        <button
          type="button"
          className={own.play}
          onClick={() => (playing ? stop() : void start())}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
        <div className={`${css.field} ${own.tempo}`}>
          <span>
            {/* Not an <output>: its status role would announce every step of a drag. */}
            <label htmlFor={tempoId}>Tempo</label> <span className={own.bpm}>{bpm} bpm</span>
          </span>
          <input
            id={tempoId}
            type="range"
            aria-valuetext={`${bpm} beats per minute`}
            min={TEMPO.min}
            max={TEMPO.max}
            step={TEMPO.step}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </div>
        <label className={css.field}>
          <span>Strum</span>
          <select value={pattern} onChange={(e) => setPattern(e.target.value as StrumPatternName)}>
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          Loop
        </label>
      </div>

      {suggestions.length > 0 && (
        <div className={own.suggest}>
          <span className={styles.muted}>Open shapes for {keyTitle(key)}:</span>
          {suggestions.map((o) => (
            <button
              key={o.capo}
              type="button"
              className={styles.secondaryButton}
              aria-pressed={o.capo === capo}
              onClick={() => setCapo(o.capo)}
            >
              {o.capo === 0 ? 'No capo' : `Capo ${o.capo}`}: {keyTitle(o.shape)} shapes
            </button>
          ))}
        </div>
      )}

      <div className={own.neckHead}>
        <h3 className={own.subhead} data-testid="player-neck-chord">
          {pretty(chord.shape.symbol)}
          {capo > 0 && ` shape, capo ${capo}: sounds ${pretty(chord.sounding.symbol)}`}
        </h3>
        {legend.length > 0 && (
          <ul className={css.legend} aria-label="Legend">
            {legend.map((s) => (
              <li key={s}>
                <Swatch style={s} />
                {LEGEND[s]}
              </li>
            ))}
          </ul>
        )}
      </div>
      {chord.voicing ? (
        <div className={styles.neckScroll}>
          <Fretboard
            tuning={tuning}
            fretRange={PLAYER_RANGE}
            activeRange={capo > 0 ? { from: capo, to: PLAYER_RANGE.to } : undefined}
            handedness={settings.handedness}
            markers={markers}
            guideLevel={3}
            accidentalPref={settings.accidentalPref}
            label={`${pretty(chord.shape.symbol)} voicing${capo > 0 ? `, capo on fret ${capo}` : ''}`}
          />
        </div>
      ) : (
        <p className={styles.muted}>No voicing of {pretty(chord.shape.symbol)} to show here.</p>
      )}
    </>
  );
}
