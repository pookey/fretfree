import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import {
  Fretboard,
  type FretMarker,
  type MarkerStyle,
} from '../../../components/fretboard/Fretboard';
import {
  SKILLS,
  deriveStatus,
  isFrontier,
  parseItemId,
  type Skill,
  type SkillStatus,
} from '../../../engine';
import { focusHref, noteSkillIds, type SessionFocus } from '../../../session/focus';
import { getDb, getSkillStates } from '../../../storage';
import {
  INTERVALS,
  STANDARD_TUNING,
  allStrings,
  chordFormula,
  chordKindInfo,
  chromaOf,
  chromaToPc,
  getTuning,
  harmonicMinorScale,
  majorKey,
  midiAt,
  minorKey,
  nameChord,
  parseChord,
  pentatonicScale,
  scaleOf,
  spellChord,
  type AccidentalPref,
  type ChordDegree,
  type ChordKind,
  type FretRange,
  type IntervalInfo,
  type IntervalName,
  type Tuning,
} from '../../../theory';
import styles from '../../screens.module.css';
import css from './fretboard-explorer.module.css';

export const id = 'fretboard-explorer';
export const title = 'Fretboard explorer';
export const order = 10;

/**
 * Fretboard explorer v2 (design §7 Explore): pick a root and a key, scale or
 * chord, see it across the whole neck, and label it by note name, degree or
 * interval. Reference only, no grading; "Quiz me on this" turns it into recall
 * (research/02 rule 4).
 */

/** The whole neck (design §7): the session neck's 15 frets, scrolled on narrow screens. */
export const EXPLORER_RANGE: FretRange = { from: 0, to: 15 };

export type LabelMode = 'names' | 'degrees' | 'intervals';

export const LABEL_MODES: readonly { mode: LabelMode; label: string }[] = [
  { mode: 'names', label: 'Note names' },
  { mode: 'degrees', label: 'Degrees' },
  { mode: 'intervals', label: 'Intervals' },
];

interface ScaleChoice {
  readonly id: string;
  readonly group: 'Key' | 'Scale';
  readonly label: string;
  /** The name after the root: "C major key". */
  readonly name: string;
  readonly notes: (root: string) => string[];
}

const SCALE_CHOICES: readonly ScaleChoice[] = [
  {
    id: 'major',
    group: 'Key',
    label: 'Major key',
    name: 'major key',
    notes: (r) => scaleOf(majorKey(r)),
  },
  {
    id: 'minor',
    group: 'Key',
    label: 'Minor key',
    name: 'minor key',
    notes: (r) => scaleOf(minorKey(r)),
  },
  {
    id: 'major-pentatonic',
    group: 'Scale',
    label: 'Major pentatonic',
    name: 'major pentatonic',
    notes: (r) => pentatonicScale(r, 'major'),
  },
  {
    id: 'minor-pentatonic',
    group: 'Scale',
    label: 'Minor pentatonic',
    name: 'minor pentatonic',
    notes: (r) => pentatonicScale(r, 'minor'),
  },
  {
    id: 'harmonic-minor',
    group: 'Scale',
    label: 'Harmonic minor',
    name: 'harmonic minor',
    notes: harmonicMinorScale,
  },
];

/** Chords built from a root, 3rd, 5th and maybe a 7th: the tones the view colours. */
export const CHORD_CHOICES: readonly ChordKind[] = [
  'major',
  'minor',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'diminished',
  'dim7',
  'augmented',
];

/** What the explorer shows: `scale:<id>` or `chord:<kind>`. */
export type ExplorerPick = `scale:${string}` | `chord:${ChordKind}`;

export const DEFAULT_PICK: ExplorerPick = 'scale:major';

export interface ExplorerTone {
  /** Spelled for the key or chord: E# in F# major, Bbb in Cdim7. */
  readonly pc: string;
  /** Semitones above the root, 0–11. */
  readonly semitones: number;
  /** `1`, `b3` … for scales; `R`, `3`, `b7` … for chords. */
  readonly degree: string;
  /** `P1`, `M3`, `d5` … */
  readonly interval: string;
  readonly style: MarkerStyle;
}

export interface ExplorerContent {
  /** The root as spelled: Db major key, C# minor key. */
  readonly root: string;
  /** "C major key", "Bm7". */
  readonly name: string;
  readonly chord: ChordKind | null;
  readonly tones: readonly ExplorerTone[];
}

/** Chord formula degree → its interval above the root, as players write it. */
const CHORD_DEGREE_INTERVAL: Partial<Record<ChordDegree, string>> = {
  '1': 'P1',
  b3: 'm3',
  '3': 'M3',
  b5: 'd5',
  '5': 'P5',
  '#5': 'A5',
  bb7: 'd7',
  b7: 'm7',
  '7': 'M7',
};

/** Chord degree → marker: root a square, 3rd a circle, 5th a triangle, 7th a hexagon. */
function chordStyle(degree: ChordDegree): MarkerStyle {
  if (degree === '1') return 'root';
  if (degree.endsWith('3')) return 'third';
  if (degree.endsWith('5')) return 'fifth';
  return 'seventh';
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

const accidentals = (notes: readonly string[]) =>
  notes.reduce((sum, n) => sum + (n.match(/[#b]/g)?.length ?? 0), 0);

function scaleChoice(pick: ExplorerPick): ScaleChoice | null {
  return SCALE_CHOICES.find((s) => `scale:${s.id}` === pick) ?? null;
}

function chordChoice(pick: ExplorerPick): ChordKind | null {
  const kind = pick.slice('chord:'.length) as ChordKind;
  return pick.startsWith('chord:') && CHORD_CHOICES.includes(kind) ? kind : null;
}

/**
 * The notes of a pick on a root (a chroma, 0 = C). The root is spelled
 * whichever way needs fewer accidentals (Db major, but C# minor), falling
 * back to the learner's preference on a tie (F# or Gb major).
 */
export function explorerContent(
  rootChroma: number,
  pick: ExplorerPick,
  pref: AccidentalPref = 'sharp',
): ExplorerContent {
  const kind = chordChoice(pick);
  const scale = kind ? null : (scaleChoice(pick) ?? (scaleChoice(DEFAULT_PICK) as ScaleChoice));
  const spell = (root: string) => (kind ? spellChord(root, kind) : scale!.notes(root));
  const preferred = chromaToPc(mod12(rootChroma), pref);
  const other = chromaToPc(mod12(rootChroma), pref === 'sharp' ? 'flat' : 'sharp');
  const root = accidentals(spell(other)) < accidentals(spell(preferred)) ? other : preferred;
  const notes = spell(root);
  const tones = notes.map((pc, i): ExplorerTone => {
    const semitones = mod12(chromaOf(pc) - chromaOf(root));
    const info = INTERVALS[semitones] as IntervalInfo;
    if (kind) {
      const degree = chordFormula(kind)[i] as ChordDegree;
      return {
        pc,
        semitones,
        degree: degree === '1' ? 'R' : degree,
        interval: CHORD_DEGREE_INTERVAL[degree] ?? info.name,
        style: chordStyle(degree),
      };
    }
    return {
      pc,
      semitones,
      degree: info.degree,
      interval: info.name,
      style: semitones === 0 ? 'root' : 'tone',
    };
  });
  return {
    root,
    name: kind ? nameChord(root, kind) : `${root} ${scale!.name}`,
    chord: kind,
    tones,
  };
}

function toneLabel(t: ExplorerTone, labels: LabelMode): string {
  if (labels === 'degrees') return t.degree;
  if (labels === 'intervals') return t.interval;
  return t.pc;
}

/** Every cell of the range that holds a tone of the pick, labelled per the mode. */
export function explorerMarkers(
  content: ExplorerContent,
  labels: LabelMode,
  range: FretRange = EXPLORER_RANGE,
  tuning: Tuning = STANDARD_TUNING,
): FretMarker[] {
  const rootChroma = chromaOf(content.root);
  const bySemitones = new Map(content.tones.map((t) => [t.semitones, t]));
  const out: FretMarker[] = [];
  for (const string of allStrings(tuning)) {
    for (let fret = range.from; fret <= range.to; fret++) {
      const tone = bySemitones.get(mod12(midiAt({ string, fret }, tuning) - rootChroma));
      if (tone) out.push({ string, fret, style: tone.style, label: toneLabel(tone, labels) });
    }
  }
  return out;
}

/** The D37 drill ("Chord tones across the neck", M3-14), once it exists. */
export const CHORD_TONES_DRILL = 'chord-tones-neck';

/** True when an item ID names this chord in one of its `:`/`@`/`→` fields, in any spelling. */
function itemNamesChord(itemId: string, root: string, kind: ChordKind): boolean {
  return itemId.split(/[:@→]/).some((field) => {
    try {
      const c = parseChord(field);
      return c.kind === kind && chromaOf(c.root) === chromaOf(root);
    } catch {
      return false;
    }
  });
}

/** Skills whose items are all interval shapes (C3) and drill one of these intervals. */
export function intervalSkillIds(
  skills: readonly Skill[],
  intervals: ReadonlySet<IntervalName>,
): string[] {
  return skills
    .filter((s) => {
      const refs = s.items().map((i) => parseItemId(i.id));
      return (
        refs.length > 0 &&
        refs.every((r) => r?.kind === 'interval' || r?.kind === 'interval-name') &&
        refs.some((r) => r && 'interval' in r && intervals.has(r.interval))
      );
    })
    .map((s) => s.id);
}

/**
 * The skills a session may serve new items from (unlocked or practising), as
 * the runner derives them: in registry order, so prerequisites resolve first.
 */
export function frontierSkillIds(
  skills: readonly Skill[],
  stored: ReadonlyMap<string, SkillStatus>,
): Set<string> {
  const statuses = new Map(stored);
  const out = new Set<string>();
  for (const skill of skills) {
    const status = deriveStatus(skill, statuses, stored.get(skill.id));
    statuses.set(skill.id, status);
    if (isFrontier(status)) out.add(skill.id);
  }
  return out;
}

/**
 * "Quiz me on this" (design §7): a focused session on what the explorer
 * shows. A chord opens D37 on that chord when a skill offers it; otherwise
 * degrees and intervals quiz the interval shapes they show, and note names
 * the notes on the neck. Skills are found by what they drill, so new ones
 * join without editing this view.
 *
 * Gating stays on in a focused session (research/02 rule 7), so D37 and the
 * interval shapes are offered only once on the learner's `frontier`; until
 * then (or while it loads) the quiz falls back to the notes, which a new
 * learner can practise.
 */
export function quizFocus(
  content: ExplorerContent,
  labels: LabelMode,
  frontier: ReadonlySet<string> = new Set(),
  skills: readonly Skill[] = SKILLS,
): Partial<SessionFocus> {
  const { chord } = content;
  const open = skills.filter((s) => frontier.has(s.id));
  if (chord) {
    const d37 = open.filter((s) => s.drillTypes.includes(CHORD_TONES_DRILL));
    const itemIds = d37
      .flatMap((s) => s.items())
      .filter((i) => itemNamesChord(i.id, content.root, chord))
      .map((i) => i.id);
    if (itemIds.length > 0) return { itemIds };
    if (d37.length > 0) return { skillIds: d37.map((s) => s.id) };
  }
  if (labels !== 'names') {
    const shown = new Set(
      content.tones
        .filter((t) => t.semitones > 0)
        .map((t) => (INTERVALS[t.semitones] as IntervalInfo).name),
    );
    const ids = intervalSkillIds(open, shown);
    if (ids.length > 0) return { skillIds: ids };
  }
  return { skillIds: noteSkillIds(skills) };
}

const ROOT_OPTIONS = Array.from({ length: 12 }, (_, chroma) => {
  const sharp = chromaToPc(chroma, 'sharp');
  const flat = chromaToPc(chroma, 'flat');
  return { chroma, label: sharp === flat ? sharp : `${sharp} / ${flat}` };
});

const LEGEND: Partial<Record<MarkerStyle, string>> = {
  root: 'Root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  tone: 'Scale note',
};

/** A legend swatch drawn in the marker's own shape, so it reads without colour. */
function Swatch({ style }: { style: MarkerStyle }) {
  return (
    <svg className={css.swatch} data-style={style} viewBox="-12 -12 24 24" aria-hidden="true">
      {style === 'root' ? (
        <rect x={-9} y={-9} width={18} height={18} rx={4} />
      ) : style === 'fifth' ? (
        <polygon points="0,-11 11,8 -11,8" />
      ) : style === 'seventh' ? (
        <polygon points="10,0 5,8.7 -5,8.7 -10,0 -5,-8.7 5,-8.7" />
      ) : (
        <circle r={9} />
      )}
    </svg>
  );
}

/** The learner's frontier skills, read once from storage; empty until loaded. */
function useFrontier(): ReadonlySet<string> {
  const [frontier, setFrontier] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let live = true;
    void getSkillStates(getDb()).then((states) => {
      if (!live) return;
      const stored = new Map([...states.values()].map((s) => [s.skillId, s.status]));
      setFrontier(frontierSkillIds(SKILLS, stored));
    });
    return () => {
      live = false;
    };
  }, []);
  return frontier;
}

export function View() {
  const { handedness, accidentalPref, tuning: tuningId } = useAppStore((s) => s.settings);
  const [rootChroma, setRootChroma] = useState(0);
  const [pick, setPick] = useState<ExplorerPick>(DEFAULT_PICK);
  const [labels, setLabels] = useState<LabelMode>('names');
  const labelGroup = useId();
  const tuning = getTuning(tuningId);

  const content = useMemo(
    () => explorerContent(rootChroma, pick, accidentalPref),
    [rootChroma, pick, accidentalPref],
  );
  const markers = useMemo(
    () => explorerMarkers(content, labels, EXPLORER_RANGE, tuning),
    [content, labels, tuning],
  );
  const frontier = useFrontier();
  const quizHref = focusHref(quizFocus(content, labels, frontier));
  const legend = [...new Set(content.tones.map((t) => t.style))];
  const kindName = content.chord ? chordKindInfo(content.chord).name : null;

  return (
    <>
      <div className={css.controls}>
        <label className={css.field}>
          <span>Root</span>
          <select value={rootChroma} onChange={(e) => setRootChroma(Number(e.target.value))}>
            {ROOT_OPTIONS.map((r) => (
              <option key={r.chroma} value={r.chroma}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>Show</span>
          <select value={pick} onChange={(e) => setPick(e.target.value as ExplorerPick)}>
            {(['Key', 'Scale'] as const).map((group) => (
              <optgroup key={group} label={group}>
                {SCALE_CHOICES.filter((s) => s.group === group).map((s) => (
                  <option key={s.id} value={`scale:${s.id}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Chord">
              {CHORD_CHOICES.map((k) => (
                <option key={k} value={`chord:${k}`}>
                  {chordKindInfo(k).name.charAt(0).toUpperCase() + chordKindInfo(k).name.slice(1)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <fieldset className={css.segmented}>
          <legend>Labels</legend>
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
        <h2 className={css.name} data-testid="explorer-name">
          {content.name}
          {kindName && <span className={styles.muted}> ({kindName})</span>}
        </h2>
        <ul className={css.tones} aria-label="Notes" data-testid="explorer-notes">
          {content.tones.map((t) => (
            <li key={t.semitones}>
              <strong>{t.pc}</strong>{' '}
              <span>{toneLabel(t, labels === 'names' ? 'degrees' : labels)}</span>
            </li>
          ))}
        </ul>
        <ul className={css.legend} aria-label="Legend" data-testid="explorer-legend">
          {legend.map((s) => (
            <li key={s}>
              <Swatch style={s} />
              {LEGEND[s]}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.neckScroll}>
        <Fretboard
          tuning={tuning}
          fretRange={EXPLORER_RANGE}
          handedness={handedness}
          markers={markers}
          guideLevel={3}
          accidentalPref={accidentalPref}
          label={`${content.name} across the neck`}
        />
      </div>
    </>
  );
}
