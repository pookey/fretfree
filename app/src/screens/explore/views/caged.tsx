import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import { useReducedMotion } from '../../../components/confetti/reduced-motion';
import {
  Fretboard,
  type FretMarker,
  type MarkerStyle,
} from '../../../components/fretboard/Fretboard';
import { SKILLS, isFrontier, parseItemId, type Skill, type SkillStatus } from '../../../engine';
import {
  focusHref,
  nearestOpenSkills,
  noteSkillIds,
  type SessionFocus,
} from '../../../session/focus';
import {
  STANDARD_TUNING,
  cagedChain,
  chromaToPc,
  shapeSpan,
  triadCore,
  type AccidentalPref,
  type CagedQuality,
  type CagedShape,
  type ChordKind,
  type Degree,
  type FretRange,
  type TriadCore,
} from '../../../theory';
import { chordKeySpelling } from '../../../theory/key-spelling';
import styles from '../../screens.module.css';
import { EXPLORER_RANGE, Swatch, explorerContent, useSkillStatuses } from './fretboard-explorer';
import css from './fretboard-explorer.module.css';
import own from './caged.module.css';

/**
 * CAGED visualiser (design §7 Explore): pick a chord and watch its five
 * shapes chain up the neck, each with its triad core highlighted (research/03:
 * triads are the cores of the shapes). Reference only, no grading; "Quiz me on
 * this" turns it into recall (research/02 rule 4).
 */

/** How long each shape stays up while the chain plays. */
export const STEP_MS = 1800;

export const QUALITIES: readonly { quality: CagedQuality; kind: ChordKind; label: string }[] = [
  { quality: 'major', kind: 'major', label: 'Major' },
  { quality: 'minor', kind: 'minor', label: 'Minor' },
  { quality: 'dominant7', kind: '7', label: 'Dominant 7' },
];

export type CagedLabels = 'degrees' | 'names';

export interface ChainLink {
  readonly shape: CagedShape;
  readonly core: TriadCore;
  readonly span: FretRange;
}

export interface CagedContent {
  /** The root as spelled from the chord's key: Db, but C#m; Bb whatever the setting. */
  readonly root: string;
  /** How the chord's notes are named (`chordKeySpelling`): the setting only breaks ties. */
  readonly spelling: AccidentalPref;
  /** "C", "C#m", "Bb7". */
  readonly name: string;
  readonly quality: CagedQuality;
  /** Shape degree → note, spelled for the chord. */
  readonly notes: ReadonlyMap<Degree, string>;
  /** The five shapes, lowest on the neck first. */
  readonly chain: readonly ChainLink[];
}

/**
 * A chord's CAGED chain on a root (a chroma, 0 = C), spelled from the chord's
 * key as the shape drills spell it (`chordKeySpelling`): B♭, not A♯, even for
 * a learner who prefers sharps (research/02 rule 4).
 */
export function cagedContent(
  rootChroma: number,
  quality: CagedQuality,
  pref: AccidentalPref = 'sharp',
): CagedContent {
  const known = QUALITIES.find((q) => q.quality === quality) ?? QUALITIES[0]!;
  const spelling = chordKeySpelling(rootChroma, known.quality, pref);
  const content = explorerContent(rootChroma, `chord:${known.kind}`, spelling);
  const chain = cagedChain(content.root, { quality: known.quality }).map((shape): ChainLink => ({
    shape,
    core: triadCore(shape),
    span: shapeSpan(shape),
  }));
  return {
    root: content.root,
    spelling,
    name: content.name,
    quality: known.quality,
    notes: new Map(content.tones.map((t) => [t.degree as Degree, t.pc])),
    chain,
  };
}

/** The neck the chain plays on: the explorer's 15 frets, or more if a shape sits higher. */
export function chainRange(content: CagedContent): FretRange {
  const top = Math.max(...content.chain.map((l) => l.span.to));
  return { from: EXPLORER_RANGE.from, to: Math.max(EXPLORER_RANGE.to, top) };
}

/** Triad-core degree → marker: root a square, 3rd a circle, 5th a triangle. */
function coreStyle(degree: Degree): MarkerStyle {
  if (degree === 'R') return 'root';
  if (degree === '5') return 'fifth';
  return 'third';
}

/**
 * One shape's markers: its triad core in the chord-tone styles, and the rest
 * of the shape as dashed guide notes. A dominant-7 shape's core is the major
 * triad at the same position (`triadCore`), so its b7 keeps its hexagon.
 */
export function linkMarkers(
  content: CagedContent,
  link: ChainLink,
  labels: CagedLabels,
): FretMarker[] {
  const group = `${link.shape.shape}-shape`;
  const label = (d: Degree) => (labels === 'names' ? (content.notes.get(d) ?? d) : d);
  const core = link.core.notes.map((n): FretMarker => ({
    ...n,
    style: coreStyle(n.degree),
    label: label(n.degree),
    group,
  }));
  const onCore = new Set(core.map((m) => `${m.string}:${m.fret}`));
  const rest = link.shape.notes
    .filter((n) => !onCore.has(`${n.string}:${n.fret}`))
    .map((n): FretMarker => ({
      ...n,
      style: n.degree === 'b7' ? 'seventh' : 'ghost',
      label: label(n.degree),
      group,
    }));
  return [...core, ...rest];
}

/**
 * The markers for one step of the chain, or for the whole chain (`null`).
 * Neighbouring shapes share notes; a shared cell shows the stronger style.
 */
export function chainMarkers(
  content: CagedContent,
  step: number | null,
  labels: CagedLabels,
): FretMarker[] {
  const links = step === null ? content.chain : content.chain.slice(step, step + 1);
  const byCell = new Map<string, FretMarker>();
  for (const m of links.flatMap((l) => linkMarkers(content, l, labels))) {
    const key = `${m.string}:${m.fret}`;
    const had = byCell.get(key);
    if (!had || had.style === 'ghost') byCell.set(key, m);
  }
  return [...byCell.values()];
}

/** C6 skills whose items are all CAGED shapes or cores of one quality, in registry order. */
export function cagedSkillIds(skills: readonly Skill[], quality: CagedQuality): string[] {
  return skills
    .filter((s) => {
      const refs = s.items().map((i) => parseItemId(i.id));
      return (
        refs.length > 0 &&
        refs.every(
          (r) => (r?.kind === 'caged' || r?.kind === 'caged-core') && r.quality === quality,
        )
      );
    })
    .map((s) => s.id);
}

/**
 * "Quiz me on this" (design §7): a focused session on the shapes of the
 * chord's quality, all five, so C and A interleave (research/02 rule 6).
 * Gating stays on (rule 7), so until those skills are open the quiz walks
 * back through the gates each still waits for (`statuses`, M10-02) and offers
 * the nearest open ones (the roots on strings 6 and 5, triads), and failing
 * that the notes on the neck. Skills are found by what they drill, so new ones
 * join without editing this view.
 */
export function cagedQuizFocus(
  quality: CagedQuality,
  statuses: ReadonlyMap<string, SkillStatus> = new Map(),
  skills: readonly Skill[] = SKILLS,
): Partial<SessionFocus> {
  const frontier = new Set(
    skills.filter((s) => isFrontier(statuses.get(s.id) ?? 'locked')).map((s) => s.id),
  );
  const open = nearestOpenSkills(cagedSkillIds(skills, quality), frontier, skills, statuses);
  return { skillIds: open ?? noteSkillIds(skills) };
}

const ROOT_OPTIONS = Array.from({ length: 12 }, (_, chroma) => {
  const sharp = chromaToPc(chroma, 'sharp');
  const flat = chromaToPc(chroma, 'flat');
  return { chroma, label: sharp === flat ? sharp : `${sharp} / ${flat}` };
});

const LABEL_MODES: readonly { mode: CagedLabels; label: string }[] = [
  { mode: 'degrees', label: 'Degrees' },
  { mode: 'names', label: 'Note names' },
];

const LEGEND: Partial<Record<MarkerStyle, string>> = {
  root: 'Root',
  third: '3rd',
  fifth: '5th',
  seventh: 'b7',
  ghost: 'Rest of the shape',
};

const frets = (span: FretRange) =>
  span.from === span.to ? `fret ${span.from}` : `frets ${span.from}–${span.to}`;

const strings = (core: TriadCore) => `strings ${core.lowString}–${core.lowString - 2}`;

export function View() {
  const { handedness, accidentalPref, tuning } = useAppStore((s) => s.settings);
  const reduced = useReducedMotion();
  const [rootChroma, setRootChroma] = useState(0);
  const [quality, setQuality] = useState<CagedQuality>('major');
  const [labels, setLabels] = useState<CagedLabels>('degrees');
  /** The shape on show, by chain index; null shows the whole chain. */
  const [step, setStep] = useState<number | null>(0);
  const [playing, setPlaying] = useState(false);
  const labelGroup = useId();
  const scroller = useRef<HTMLDivElement>(null);

  const content = useMemo(
    () => cagedContent(rootChroma, quality, accidentalPref),
    [rootChroma, quality, accidentalPref],
  );
  const range = chainRange(content);
  const markers = useMemo(() => chainMarkers(content, step, labels), [content, step, labels]);
  const statuses = useSkillStatuses();
  const quizHref = focusHref(cagedQuizFocus(quality, statuses));
  const link = step === null ? null : content.chain[step];
  const next = step === null ? null : content.chain[(step + 1) % content.chain.length];
  const legend = (['root', 'third', 'fifth', 'seventh', 'ghost'] as const).filter((s) =>
    markers.some((m) => m.style === s),
  );

  // Playing walks the chain once, a shape per STEP_MS, and stops on the last.
  const playable = !reduced;
  const active = playing && playable;
  const last = content.chain.length - 1;
  // A new chord restarts the timer, so its first shape gets a full step.
  useEffect(() => {
    if (!active || step === null) return;
    const timer = setTimeout(() => {
      setStep(step + 1);
      if (step + 1 >= last) setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [active, step, last, content]);

  // Reduced motion stops the chain for good: turning it off again doesn't resume it.
  if (reduced && playing) setPlaying(false);

  // Keep the shape on show in view where the neck scrolls (phones, narrow windows).
  useEffect(() => {
    const el = scroller.current;
    if (!el || !link || el.scrollWidth <= el.clientWidth) return;
    const frets = range.to - range.from + 1;
    const left = (el.scrollWidth * (link.span.from - range.from)) / frets - el.clientWidth / 4;
    el.scrollTo?.({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
  }, [link, range.from, range.to, reduced]);

  /** A new chord starts the chain from its lowest shape, playing it where motion is welcome. */
  const restart = () => {
    setStep(0);
    setPlaying(playable);
  };

  const play = () => {
    if (step === null || step >= last) setStep(0);
    setPlaying(true);
  };

  const show = (at: number | null) => {
    setPlaying(false);
    setStep(at);
  };

  return (
    <>
      <div className={css.controls}>
        <label className={css.field}>
          <span>Root</span>
          <select
            value={rootChroma}
            onChange={(e) => {
              setRootChroma(Number(e.target.value));
              restart();
            }}
          >
            {ROOT_OPTIONS.map((r) => (
              <option key={r.chroma} value={r.chroma}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>Chord</span>
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value as CagedQuality);
              restart();
            }}
          >
            {QUALITIES.map((q) => (
              <option key={q.quality} value={q.quality}>
                {q.label}
              </option>
            ))}
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

      <div className={own.chainBar}>
        {playable && (
          <button
            type="button"
            className={own.play}
            onClick={() => (active ? setPlaying(false) : play())}
          >
            {active ? 'Pause' : 'Play the chain'}
          </button>
        )}
        <ol className={own.chain} aria-label={`CAGED chain of ${content.name}`}>
          {content.chain.map((l, i) => (
            <li key={l.shape.shape}>
              <button
                type="button"
                aria-pressed={step === i}
                data-testid={`chain-${l.shape.shape}`}
                onClick={() => show(i)}
              >
                <strong>{l.shape.shape} shape</strong>
                <span>{frets(l.span)}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" aria-pressed={step === null} onClick={() => show(null)}>
              <strong>Whole chain</strong>
              <span>all five</span>
            </button>
          </li>
        </ol>
      </div>

      <div className={css.summary}>
        <h2 className={css.name} data-testid="caged-name">
          {link ? `${content.name}: ${link.shape.shape} shape` : `${content.name}: the whole chain`}
        </h2>
        <p className={own.detail} aria-live="polite" data-testid="caged-detail">
          {link && next
            ? `Root on string ${link.shape.rootString}, ${frets(link.span)}. Triad core on ${strings(link.core)}. Next up the neck: the ${next.shape.shape} shape.`
            : 'Each shape shares notes with the next; after the fifth, the chain repeats 12 frets up.'}
        </p>
        {tuning !== STANDARD_TUNING.id && (
          <p className={styles.muted}>CAGED shapes are shown in standard tuning.</p>
        )}
        <ul
          className={`${css.legend} ${own.legend}`}
          aria-label="Legend"
          data-testid="caged-legend"
        >
          {legend.map((s) => (
            <li key={s}>
              <Swatch style={s} />
              {LEGEND[s]}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.neckScroll} ref={scroller}>
        <div key={step ?? 'all'} className={own.stage}>
          <Fretboard
            fretRange={range}
            activeRange={link?.span}
            handedness={handedness}
            markers={markers}
            guideLevel={3}
            accidentalPref={content.spelling}
            label={
              link
                ? `${link.shape.shape} shape of ${content.name}, ${frets(link.span)}`
                : `Every CAGED shape of ${content.name}`
            }
          />
        </div>
      </div>
    </>
  );
}
