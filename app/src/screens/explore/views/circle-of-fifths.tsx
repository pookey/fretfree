import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type { PlayOptions } from '../../../audio/audio';
import { useAppStore } from '../../../app-store';
import { SKILLS, isFrontier, type Skill, type SkillStatus } from '../../../engine';
import { focusHref, nearestOpenSkills, type SessionFocus } from '../../../session/focus';
import {
  CIRCLE_OF_FIFTHS,
  chromaOf,
  chromaToPc,
  circlePosition,
  diatonicChords,
  dominantKey,
  keySignature,
  relativeKey,
  subdominantKey,
  type CircleEntry,
  type DiatonicChord,
  type KeyMode,
  type KeySignature,
  type MusicalKey,
} from '../../../theory';
import styles from '../../screens.module.css';
import { useSkillStatuses } from './fretboard-explorer';
import css from './fretboard-explorer.module.css';
import own from './circle-of-fifths.module.css';

/**
 * Circle of fifths (design §7 Explore; research/03 I3): the twelve major keys
 * round the outside and their relative minors inside. Tapping a key shows
 * its signature, its relative key, its neighbours (the IV and the V) and its
 * chords, marks those chords on the circle, and plays its tonic triad, so a
 * key is heard, seen and named together (research/02 rule 10). Reference
 * only, no grading.
 *
 * The three positions at the bottom have two spellings each (B/C♭, F♯/G♭,
 * D♭/C♯; M4-01 `CircleEntry.enharmonic`). Both are shown, and the selected
 * key keeps the spelling it was reached by, so stepping round from F♯ gives
 * C♯ and from G♭ gives D♭.
 *
 * "Quiz me on this" opens a focused session on I3 (D40's key-signature
 * cards), so the circle is recalled, not just re-read (research/02 rule 4).
 */

/**
 * The audio module, imported on demand: a static import from this lazy view
 * would move it into the view's chunk, ahead of the first tap that unlocks it.
 */
function playNotes(notes: readonly string[], opts: PlayOptions): Promise<void> {
  return import('../../../audio/audio').then((audio) => audio.playNotes(notes, opts));
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * "Quiz me on this" (design §7): a focused session on the I3 skills the
 * learner has open. Gating stays on (rule 7), so until any are open the quiz
 * walks back through the gates each still waits for (`statuses`, M10-02:
 * C4's keys, then F1's steps) and offers the nearest open ones, as the CAGED
 * view does. Skills are found by topic, so new I3 skills join without editing
 * this view.
 */
export function circleQuizFocus(
  statuses: ReadonlyMap<string, SkillStatus> = new Map(),
  skills: readonly Skill[] = SKILLS,
): Partial<SessionFocus> {
  const frontier = new Set(
    skills.filter((s) => isFrontier(statuses.get(s.id) ?? 'locked')).map((s) => s.id),
  );
  const i3 = skills.filter((s) => s.topic === 'I3').map((s) => s.id);
  return { skillIds: nearestOpenSkills(i3, frontier, skills, statuses) ?? i3 };
}

const MODES: readonly KeyMode[] = ['major', 'minor'];

/** The spellings the circle gives a position in one mode, primary first: B, C♭. */
export function circleSpellings(position: number, mode: KeyMode): string[] {
  const e = CIRCLE_OF_FIFTHS[mod12(position)] as CircleEntry;
  const primary = mode === 'major' ? e.major : e.minor;
  if (!e.enharmonic) return [primary];
  return [primary, mode === 'major' ? e.enharmonic.major : e.enharmonic.minor];
}

/**
 * A key as the circle spells it: its own spelling where the circle has it,
 * otherwise its position's primary one (G♯ major, eight sharps, is A♭).
 */
export function onCircle(key: MusicalKey): MusicalKey {
  const spellings = circleSpellings(circlePosition(key), key.mode);
  return spellings.includes(key.tonic) ? key : { tonic: spellings[0] as string, mode: key.mode };
}

/** Display form: `F#` → `F♯`, `Bbm` → `B♭m`, `bVII` → `♭VII`. */
export function pretty(text: string): string {
  return text
    .replace(/#/g, '♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/^b/, '♭');
}

/** Accessible form: `F#` → `F sharp`, `Bb` → `B flat`. */
export function spoken(tonic: string): string {
  const accidental = tonic.slice(1);
  return tonic.charAt(0) + (accidental === '#' ? ' sharp' : accidental === 'b' ? ' flat' : '');
}

export function keyTitle(key: MusicalKey): string {
  return `${pretty(key.tonic)} ${key.mode}`;
}

/** `6 sharps: F♯ C♯ G♯ D♯ A♯ E♯`, `1 flat: B♭`, `No sharps or flats`. */
export function signatureText(sig: KeySignature): string {
  const n = sig.sharps || sig.flats;
  if (n === 0) return 'No sharps or flats';
  const kind = sig.sharps ? 'sharp' : 'flat';
  return `${n} ${kind}${n === 1 ? '' : 's'}: ${sig.accidentals.map(pretty).join(' ')}`;
}

/** The ring's short form: `3♯`, `2♭`, `0`. */
export function signatureShort(sig: KeySignature): string {
  if (sig.sharps) return `${sig.sharps}♯`;
  if (sig.flats) return `${sig.flats}♭`;
  return '0';
}

function signatureSpoken(sig: KeySignature): string {
  const n = sig.sharps || sig.flats;
  if (n === 0) return 'no sharps or flats';
  return `${n} ${sig.sharps ? 'sharp' : 'flat'}${n === 1 ? '' : 's'}`;
}

export const wedgeId = (position: number, mode: KeyMode) => `${mode}:${mod12(position)}`;

export interface FamilyChord {
  /** `V`, `vi`, `♭VII`: the chord's numeral in the selected key. */
  readonly numeral: string;
  /** The chord's root as the key spells it: C♯ in F♯ major, D♭ in G♭. */
  readonly tonic: string;
}

/**
 * The selected key's diatonic triads that have a place on the circle, by
 * wedge: I, IV and V side by side outside, ii, iii and vi inside (or their
 * minor-key counterparts). The diminished triad has no place.
 */
export function keyFamily(key: MusicalKey): Map<string, FamilyChord> {
  const family = new Map<string, FamilyChord>();
  for (const c of diatonicChords(key)) {
    if (c.quality !== 'major' && c.quality !== 'minor') continue;
    const mode: KeyMode = c.quality;
    family.set(wedgeId(circlePosition({ tonic: c.root, mode }), mode), {
      numeral: pretty(c.roman),
      tonic: c.root,
    });
  }
  return family;
}

/** The key a wedge selects: the spelling the selected key's chord uses there, if the circle has it. */
export function keyOfWedge(
  position: number,
  mode: KeyMode,
  family: ReadonlyMap<string, FamilyChord> = new Map(),
): MusicalKey {
  const spellings = circleSpellings(position, mode);
  const tonic = family.get(wedgeId(position, mode))?.tonic;
  return { tonic: tonic && spellings.includes(tonic) ? tonic : (spellings[0] as string), mode };
}

/** Keyboard (design §7): ←/→ step round the circle, ↑/↓ move to the major or minor ring. */
export function keyFromArrow(key: MusicalKey, arrow: string): MusicalKey | null {
  switch (arrow) {
    case 'ArrowRight':
      return onCircle(dominantKey(key));
    case 'ArrowLeft':
      return onCircle(subdominantKey(key));
    case 'ArrowUp':
      return key.mode === 'minor' ? onCircle(relativeKey(key)) : null;
    case 'ArrowDown':
      return key.mode === 'major' ? onCircle(relativeKey(key)) : null;
    case 'Home':
      return { tonic: key.mode === 'major' ? 'C' : 'A', mode: key.mode };
    default:
      return null;
  }
}

/** The tonic triad from octave 3, for playback: `F#3 A#3 C#4`. */
export function tonicTriad(key: MusicalKey): string[] {
  const root = 48 + chromaOf(key.tonic);
  const steps = [0, key.mode === 'major' ? 4 : 3, 7];
  return steps.map((s) => {
    const midi = root + s;
    return `${chromaToPc(midi % 12, 'sharp')}${Math.floor(midi / 12) - 1}`;
  });
}

export interface KeyDetail {
  readonly key: MusicalKey;
  /** The spellings of this key's position, primary first. */
  readonly spellings: readonly string[];
  readonly signature: KeySignature;
  readonly relative: MusicalKey;
  /** Anticlockwise: IV (iv in minor). */
  readonly down: { numeral: string; key: MusicalKey };
  /** Clockwise: V (v in minor). */
  readonly up: { numeral: string; key: MusicalKey };
  readonly chords: readonly DiatonicChord[];
}

export function keyDetail(key: MusicalKey): KeyDetail {
  const major = key.mode === 'major';
  return {
    key,
    spellings: circleSpellings(circlePosition(key), key.mode),
    signature: keySignature(key),
    relative: relativeKey(key),
    down: { numeral: major ? 'IV' : 'iv', key: onCircle(subdominantKey(key)) },
    up: { numeral: major ? 'V' : 'v', key: onCircle(dominantKey(key)) },
    chords: diatonicChords(key),
  };
}

// ---------------------------------------------------------------------------
// Geometry: a 400 × 400 viewBox, C at the top, sharps clockwise.

const C = 200;
const OUTER = 194;
const SPLIT = 128;
const INNER = 64;
const RINGS: Record<KeyMode, { from: number; to: number }> = {
  major: { from: SPLIT, to: OUTER },
  minor: { from: INNER, to: SPLIT },
};

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

const f = (n: number) => Number(n.toFixed(2));

/** An annular sector covering one position of one ring. */
export function wedgePath(position: number, mode: KeyMode): string {
  const { from, to } = RINGS[mode];
  const start = position * 30 - 15;
  const end = position * 30 + 15;
  const [x1, y1] = polar(to, start);
  const [x2, y2] = polar(to, end);
  const [x3, y3] = polar(from, end);
  const [x4, y4] = polar(from, start);
  return [
    `M${f(x1)} ${f(y1)}`,
    `A${to} ${to} 0 0 1 ${f(x2)} ${f(y2)}`,
    `L${f(x3)} ${f(y3)}`,
    `A${from} ${from} 0 0 0 ${f(x4)} ${f(y4)}`,
    'Z',
  ].join(' ');
}

/** Where a wedge's text goes: `at` from 0 (inner edge) to 1 (outer edge). */
function anchor(position: number, mode: KeyMode, at: number): { x: number; y: number } {
  const { from, to } = RINGS[mode];
  const [x, y] = polar(from + (to - from) * at, position * 30);
  return { x: f(x), y: f(y) };
}

interface WedgeText {
  /** One line per name. */
  names: string[];
  signature: string;
}

/** What a wedge shows: the selected key's chord where it has one, otherwise every spelling. */
function wedgeText(position: number, mode: KeyMode, chord: FamilyChord | undefined): WedgeText {
  const suffix = mode === 'minor' ? 'm' : '';
  const spellings = circleSpellings(position, mode);
  const shown = chord ? [chord.tonic] : spellings;
  const signatures = shown
    .filter((t) => spellings.includes(t))
    .map((t) => signatureShort(keySignature({ tonic: t, mode })));
  return { names: shown.map((t) => pretty(t) + suffix), signature: signatures.join(' / ') };
}

function wedgeLabel(position: number, mode: KeyMode, chord: FamilyChord | undefined, of: string) {
  const names = circleSpellings(position, mode)
    .map((t) => `${spoken(t)} ${mode}, ${signatureSpoken(keySignature({ tonic: t, mode }))}`)
    .join(', or ');
  return chord ? `${names}; ${chord.numeral} in ${of}` : names;
}

export function View() {
  const settings = useAppStore((s) => s.settings);
  const [key, setKey] = useState<MusicalKey>({ tonic: 'C', mode: 'major' });
  const statuses = useSkillStatuses();
  const quizHref = focusHref(circleQuizFocus(statuses));
  const refs = useRef(new Map<string, SVGGElement>());
  const focusSelected = useRef(false);

  const position = circlePosition(key);
  const family = keyFamily(key);
  const detail = keyDetail(key);
  const title = keyTitle(key);

  const select = (next: MusicalKey) => {
    setKey(next);
    void playNotes(tonicTriad(next), {
      muted: !settings.soundOn,
      volume: settings.volume,
      gap: 0.06,
    });
  };

  // Arrow keys move the selection, and focus follows it (a roving tab stop).
  useEffect(() => {
    if (!focusSelected.current) return;
    focusSelected.current = false;
    refs.current.get(wedgeId(position, key.mode))?.focus();
  }, [position, key.mode]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(key);
      return;
    }
    const next = keyFromArrow(key, e.key);
    if (!next) return;
    e.preventDefault();
    focusSelected.current = true;
    select(next);
  };

  const outlines = [...family.keys()].filter((id) => id !== wedgeId(position, key.mode));

  return (
    <div className={own.layout}>
      <figure className={own.figure}>
        <svg
          className={own.circle}
          viewBox="0 0 400 400"
          role="radiogroup"
          aria-label="Keys on the circle of fifths"
          onKeyDown={onKeyDown}
        >
          {MODES.flatMap((mode) =>
            CIRCLE_OF_FIFTHS.map(({ position: p }) => {
              const id = wedgeId(p, mode);
              const chord = family.get(id);
              const checked = p === position && mode === key.mode;
              const text = wedgeText(p, mode, chord);
              const major = mode === 'major';
              // Outside, both spellings share a line; inside, the ring is narrower, so they stack.
              const lines = major ? [text.names.join(' / ')] : text.names;
              const nameAt = anchor(p, mode, major ? 0.53 : 0.52);
              const sigAt = anchor(p, mode, major ? 0.2 : 0.15);
              const numeralAt = anchor(p, mode, major ? 0.84 : 0.86);
              return (
                <g
                  key={id}
                  ref={(el) => {
                    if (el) refs.current.set(id, el);
                    else refs.current.delete(id);
                  }}
                  className={own.wedge}
                  role="radio"
                  aria-checked={checked}
                  aria-label={wedgeLabel(p, mode, chord, title)}
                  tabIndex={checked ? 0 : -1}
                  data-wedge={id}
                  data-mode={mode}
                  data-state={checked ? 'tonic' : chord ? 'family' : undefined}
                  onClick={() => select(keyOfWedge(p, mode, family))}
                >
                  <path className={own.shape} d={wedgePath(p, mode)} />
                  {chord && (
                    <text className={own.numeral} {...numeralAt} fontSize={major ? 13 : 11}>
                      {chord.numeral}
                    </text>
                  )}
                  {lines.map((line, i) => (
                    <text
                      key={line}
                      className={own.name}
                      x={nameAt.x}
                      y={nameAt.y + (i - (lines.length - 1) / 2) * 18}
                      fontSize={major ? (text.names.length > 1 ? 19 : 23) : 15}
                    >
                      {line}
                    </text>
                  ))}
                  {major && text.signature && (
                    <text className={own.signature} {...sigAt} fontSize={12}>
                      {text.signature}
                    </text>
                  )}
                </g>
              );
            }),
          )}
          {/* Outlines on top, so a neighbour's edge never covers them: the
              key's chords dashed, the key itself solid (shape, not just colour). */}
          <g aria-hidden="true" className={own.outlines}>
            {outlines.map((id) => {
              const [mode, p] = id.split(':') as [KeyMode, string];
              return (
                <path
                  key={id}
                  className={own.family}
                  d={wedgePath(Number(p), mode)}
                  data-outline="family"
                />
              );
            })}
            <path className={own.tonic} d={wedgePath(position, key.mode)} data-outline="tonic" />
          </g>
          <g aria-hidden="true" className={own.centre}>
            <circle cx={C} cy={C} r={INNER - 6} />
            <text className={own.centreName} x={C} y={C - 10} fontSize={22}>
              {pretty(key.tonic) + (key.mode === 'minor' ? 'm' : '')}
            </text>
            <text className={own.signature} x={C} y={C + 16} fontSize={13}>
              {signatureShort(detail.signature)}
            </text>
          </g>
        </svg>
        <figcaption className={styles.muted}>
          Tap a key. Clockwise is a 5th up: one more sharp, or one fewer flat.{' '}
          <span className={own.keysHint}>
            With a keyboard, ← and → step round, ↑ and ↓ switch between major and minor.
          </span>
        </figcaption>
      </figure>

      <KeyPanel detail={detail} onSelect={select} quizHref={quizHref} />
    </div>
  );
}

function KeyPanel({
  detail,
  onSelect,
  quizHref,
}: {
  detail: KeyDetail;
  onSelect: (key: MusicalKey) => void;
  quizHref: string;
}) {
  const { key, spellings, signature, relative, down, up, chords } = detail;
  const major = key.mode === 'major';
  const title = keyTitle(key);
  const spellingGroup = useId();
  const offCircle = chords.find((c) => c.quality === 'diminished');
  return (
    <div className={own.panel}>
      <div aria-live="polite" className={own.summary}>
        <h2 className={css.name} data-testid="circle-key">
          {title}
        </h2>
        <p className={own.signatureLine} data-testid="circle-signature">
          {signatureText(signature)}
        </p>
      </div>

      {spellings.length > 1 && (
        <fieldset className={css.segmented}>
          <legend>Spelling</legend>
          {spellings.map((t) => (
            <label key={t}>
              <input
                type="radio"
                name={spellingGroup}
                value={t}
                checked={t === key.tonic}
                onChange={() => onSelect({ tonic: t, mode: key.mode })}
              />
              <span>{keyTitle({ tonic: t, mode: key.mode })}</span>
            </label>
          ))}
        </fieldset>
      )}

      <dl className={own.facts}>
        <dt>Relative {major ? 'minor' : 'major'}</dt>
        <dd>
          <button type="button" className={own.jump} onClick={() => onSelect(relative)}>
            {keyTitle(relative)}
          </button>
        </dd>
        <dt>Next door</dt>
        <dd className={own.neighbours}>
          <button type="button" className={own.jump} onClick={() => onSelect(down.key)}>
            <span className={own.dir} aria-hidden="true">
              ↺
            </span>
            {down.numeral}: {keyTitle(down.key)}
          </button>
          <button type="button" className={own.jump} onClick={() => onSelect(up.key)}>
            {up.numeral}: {keyTitle(up.key)}
            <span className={own.dir} aria-hidden="true">
              ↻
            </span>
          </button>
        </dd>
      </dl>

      <h3 className={own.subhead}>Chords in {title}</h3>
      <ol className={own.chords} aria-label={`Chords in ${title}`} data-testid="circle-chords">
        {chords.map((c) => (
          <li key={c.degree} data-off-circle={c === offCircle || undefined}>
            <span className={own.chordNumeral}>{pretty(c.roman)}</span>
            <span>{pretty(c.root) + c.symbol.slice(c.root.length)}</span>
          </li>
        ))}
      </ol>
      <p className={styles.muted}>
        Six of them sit side by side on the circle, marked with a dashed edge.
        {offCircle &&
          ` ${pretty(offCircle.roman)} is diminished, so it has no place on the circle.`}
      </p>
      <Link to={quizHref} className={`${styles.secondaryButton} ${own.quiz}`}>
        Quiz me on this
      </Link>
    </div>
  );
}
