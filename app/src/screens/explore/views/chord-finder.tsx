import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Chord, Interval, Note } from 'tonal';
import guitar from '@tombatossals/chords-db/lib/guitar.json';
import { useAppStore } from '../../../app-store';
import type { PlayOptions } from '../../../audio/audio';
import {
  ChordDiagram,
  type ChordDiagramNote,
  type ChordVoicing,
  type Finger,
} from '../../../components/chord-diagram';
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
  cellLabel,
  chromaOf,
  chromaToPc,
  getTuning,
  isPracticalSpelling,
  midiAt,
  noteAt,
  parseChord,
  type AccidentalPref,
  type FretRange,
  type ParsedChord,
  type Position,
  type Tuning,
} from '../../../theory';
import styles from '../../screens.module.css';
import { EXPLORER_RANGE, Swatch, useSkillStatuses } from './fretboard-explorer';
import css from './fretboard-explorer.module.css';
import own from './chord-finder.module.css';

/**
 * Chord finder (design §7 Explore): tap notes on the neck to name the chord
 * (tonal `Chord.detect`), or type a chord symbol to see its voicings from
 * chords-db. Reference only, no grading; "Quiz me on this" turns it into
 * recall (research/02 rule 4). Every note sounds as it is tapped and every
 * voicing can be played, so a chord is heard, seen and named (rule 10).
 */

/** Seconds between strings when a chord is strummed. */
export const STRUM_GAP = 0.06;

/**
 * The audio module, imported on demand: a static import from this lazy view
 * splits the shared first-load code into extra chunks, costing about 3 KB of
 * first-load JS (design §10). It is in the first-load graph anyway, so this
 * fetches nothing.
 */
function playNotes(notes: readonly string[], opts: PlayOptions): Promise<void> {
  return import('../../../audio/audio').then((audio) => audio.playNotes(notes, opts));
}

// ---------------------------------------------------------------------------
// Naming tapped notes

/** Tapped notes: string → fret. One per string, as a hand can fret them. */
export type Picked = ReadonlyMap<number, number>;

/** Tap a cell: it picks that string's note, or lifts it if it was already picked. */
export function togglePick(picked: Picked, pos: Position): Map<number, number> {
  const next = new Map(picked);
  if (next.get(pos.string) === pos.fret) next.delete(pos.string);
  else next.set(pos.string, pos.fret);
  return next;
}

export interface PickedNote extends Position {
  /** Pitch class per the learner's accidental preference. */
  readonly pc: string;
  /** With octave, for playback: `C3`. */
  readonly name: string;
  readonly midi: number;
}

/** The tapped notes, lowest pitch first. */
export function pickedNotes(
  picked: Picked,
  tuning: Tuning = STANDARD_TUNING,
  pref: AccidentalPref = 'sharp',
): PickedNote[] {
  return [...picked]
    .map(([string, fret]) => {
      const n = noteAt({ string, fret }, tuning, pref);
      return { string, fret, pc: n.pc, name: n.name, midi: n.midi };
    })
    .sort((a, b) => a.midi - b.midi || b.string - a.string);
}

/** Pitch classes, bass first, each once: what `Chord.detect` reads. */
export function bassFirst(notes: readonly PickedNote[]): string[] {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const n of notes) {
    const c = chromaOf(n.pc);
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(n.pc);
  }
  return out;
}

export interface ChordReading {
  /** As charts write it: `C`, `Am7/C`, `Cadd9`. */
  readonly symbol: string;
  readonly root: string;
  readonly bass: string | null;
  /** tonal's name for the chord type, e.g. `major seventh`; empty when it has none. */
  readonly name: string;
}

/** The chords players reach for first, then the familiar colours; the rest (Em#5) last. */
const COMMON_TYPES: readonly string[] = ['M', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim', 'dim7'];
const FAMILIAR_TYPES: readonly string[] = [
  'sus2',
  'sus4',
  'aug',
  '5',
  '6',
  'm6',
  'Madd9',
  'madd9',
  '6add9',
  '7sus4',
  '9',
  'maj9',
  'm9',
  '7b9',
  '7#9',
  '7#5',
  '7b5',
  '11',
  'm11',
  '13',
  'mMaj7',
];

function typeTier(alias: string): number {
  if (COMMON_TYPES.includes(alias)) return 0;
  if (FAMILIAR_TYPES.includes(alias)) return 1;
  return 2;
}

/** `Am7/C` → tonic `A`, type `m7`, bass `C`. A bass is a note, so `C6/9` has none. */
function splitSymbol(symbol: string): { root: string; type: string; bass: string | null } {
  const m = /^([A-G][#b]*)(.*?)(?:\/([A-G][#b]*))?$/.exec(symbol);
  return { root: m?.[1] ?? '', type: m?.[2] ?? '', bass: m?.[3] ?? null };
}

/** tonal writes a major triad `CM`; charts write `C` (and `Cadd9`, not `CMadd9`). */
function chartType(type: string): string {
  if (type === 'M') return '';
  if (type.startsWith('Madd')) return type.slice(1);
  return type;
}

/** Letters charts avoid: double sharps and flats, and E#, B#, Cb, Fb. */
const AWKWARD = /##|bb|^(?:E#|B#|Cb|Fb)$/;

/** How awkward a chord's spelling reads, judged on its first three notes (root, 3rd, 5th). */
function awkwardness(root: string, type: string): number {
  return Chord.get(`${root}${type}`)
    .notes.slice(0, 3)
    .filter((n) => AWKWARD.test(n)).length;
}

/**
 * A detected chord respelled as charts write it. Tapped notes are spelled by
 * the learner's preference, so a Bb chord arrives as A# (A# C## E#). The
 * root gives way to its enharmonic twin when the twin's triad reads more
 * plainly: A# → Bb, G# → Ab, C# → Db, and Gbm → F#m under flats, as C5
 * spells its chords (`c5Roots`). F#maj7 keeps F#: its triad is plain. The
 * bass then takes the chord's own spelling.
 */
function respell(root: string, type: string, bass: string | null) {
  const twin = Note.enharmonic(root);
  const spelled = awkwardness(twin, type) < awkwardness(root, type) ? twin : root;
  const tone =
    bass === null
      ? undefined
      : Chord.get(`${spelled}${type}`).notes.find((n) => chromaOf(n) === chromaOf(bass));
  return { root: spelled, bass: bass === null ? null : (tone ?? bass) };
}

/**
 * Names for a set of pitch classes, bass first, best first. tonal finds every
 * reading; a common chord beats an odd one (E G C is C/E before Em#5), and
 * among sensible readings one with its root in the bass comes first (C E G A
 * is C6 before Am7/C). Odd readings are kept only when nothing else fits.
 * Roots are spelled as charts write them (`respell`): A# D F is Bb.
 */
export function readChord(pcs: readonly string[], limit = 4): ChordReading[] {
  if (pcs.length < 2) return [];
  const ranked = Chord.detect([...pcs], { assumePerfectFifth: true })
    .map((raw, index) => {
      const split = splitSymbol(raw);
      const { root, bass } = respell(split.root, split.type, split.bass);
      return { root, type: split.type, bass, index, tier: typeTier(split.type) };
    })
    .sort(
      (a, b) =>
        Number(a.tier === 2) - Number(b.tier === 2) ||
        Number(a.bass !== null) - Number(b.bass !== null) ||
        a.tier - b.tier ||
        a.index - b.index,
    );
  return ranked
    .filter((r, i) => i === 0 || r.tier < 2)
    .map((r) => ({
      symbol: `${r.root}${chartType(r.type)}${r.bass ? `/${r.bass}` : ''}`,
      root: r.root,
      bass: r.bass,
      name: Chord.get(`${r.root}${r.type}`).type,
    }))
    .filter((r, i, all) => all.findIndex((o) => o.symbol === r.symbol) === i)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Chord tones by degree

/** Root a square, 3rd a circle, 5th a triangle, 7th a hexagon; 6ths, 9ths and the rest are added notes. */
export type DegreeStyle = 'root' | 'third' | 'fifth' | 'seventh' | 'added';

export interface ChordTone {
  /** `R`, `b3`, `5`, `bb7`, `9` … */
  readonly degree: string;
  readonly style: DegreeStyle;
  /** Spelled for the chord: B# in G#aug. */
  readonly pc: string;
}

const STYLE_BY_NUMBER: Readonly<Record<number, DegreeStyle>> = {
  1: 'root',
  3: 'third',
  5: 'fifth',
  7: 'seventh',
};

/** The chord's notes by chroma (0 = C), each with its degree and marker style. A bass is ignored. */
export function chordTones(symbol: string): Map<number, ChordTone> {
  const { root, type } = splitSymbol(symbol);
  const chord = Chord.get(`${root}${type}`);
  const tones = new Map<number, ChordTone>();
  chord.intervals.forEach((name, i) => {
    const iv = Interval.get(name);
    const spelled = chord.notes[i];
    if (iv.empty || spelled === undefined) return;
    const alt = iv.alt < 0 ? 'b'.repeat(-iv.alt) : '#'.repeat(iv.alt);
    tones.set(chromaOf(spelled), {
      degree: iv.num === 1 ? 'R' : `${alt}${iv.num}`,
      style: STYLE_BY_NUMBER[iv.num] ?? 'added',
      // A double sharp or flat (D## in G#aug) reads as its plain twin.
      pc: isPracticalSpelling([spelled]) ? spelled : Note.simplify(spelled),
    });
  });
  return tones;
}

/** A note outside tonal's spelling of the chord, named by its distance from the root. */
const EXTRA_DEGREES: readonly string[] = [
  'R',
  'b9',
  '9',
  '#9',
  '3',
  '11',
  'b5',
  '5',
  '#5',
  '13',
  'b7',
  '7',
];

/**
 * The chord tone on a chroma. Voicing books fill out some chords beyond
 * tonal's spelling (an 11th chord with its 3rd, an alt chord with its b5),
 * so a note tonal leaves out is named by its interval above the root.
 */
export function toneAt(tones: ReadonlyMap<number, ChordTone>, chroma: number): ChordTone {
  const known = tones.get(chroma);
  if (known) return known;
  const root = [...tones].find(([, t]) => t.degree === 'R')?.[0] ?? 0;
  const degree = EXTRA_DEGREES[(chroma - root + 12) % 12] as string;
  const style = STYLE_BY_NUMBER[Number(degree.replace(/\D/g, ''))] ?? 'added';
  return { degree, style: degree === '#9' ? 'added' : style, pc: chromaToPc(chroma) };
}

/** On the neck an added note is a dashed ring, so it never reads as a 3rd. */
const NECK_STYLE: Readonly<Record<DegreeStyle, MarkerStyle>> = {
  root: 'root',
  third: 'third',
  fifth: 'fifth',
  seventh: 'seventh',
  added: 'ghost',
};

/**
 * The tapped notes as neck markers, labelled by note name. Once the chord is
 * named they take its degree shapes and its spelling (B# in G#aug).
 */
export function pickedMarkers(
  notes: readonly PickedNote[],
  tones: ReadonlyMap<number, ChordTone> | null,
): FretMarker[] {
  return notes.map((n) => {
    const tone = tones?.get(chromaOf(n.pc));
    return {
      string: n.string,
      fret: n.fret,
      style: tone ? NECK_STYLE[tone.style] : 'tone',
      label: tone?.pc ?? n.pc,
    };
  });
}

// ---------------------------------------------------------------------------
// Voicings from chords-db

/** One shape in chords-db: frets low string first, relative to `baseFret`; -1 muted, 0 open. */
export interface BookPosition {
  readonly frets: readonly number[];
  readonly fingers: readonly number[];
  readonly baseFret: number;
}

interface BookChord {
  readonly key: string;
  readonly suffix: string;
  readonly positions: readonly BookPosition[];
}

export interface ChordBook {
  readonly keys: readonly string[];
  readonly chords: Readonly<Record<string, readonly BookChord[]>>;
}

/** chords-db 0.5.1, guitar (MIT, © David Rubert). */
const BOOK = guitar as unknown as ChordBook;

/**
 * chords-db suffix → the suffix we write. The few tonal can't spell
 * (maj7b5, mmaj7b5, mmaj11, and 7sg, which is a slash chord) are left out,
 * so every voicing shown is styled by degree.
 */
export const BOOK_SUFFIXES: Readonly<Record<string, string>> = {
  major: '',
  minor: 'm',
  dim: 'dim',
  dim7: 'dim7',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  '7sus4': '7sus4',
  '6': '6',
  '69': '6/9',
  '7': '7',
  '7b5': '7b5',
  aug7: '7#5',
  '9': '9',
  '9b5': '9b5',
  aug9: '9#5',
  '7b9': '7b9',
  '7#9': '7#9',
  '11': '11',
  '9#11': '9#11',
  '13': '13',
  alt: '7alt',
  maj7: 'maj7',
  'maj7#5': 'maj7#5',
  maj9: 'maj9',
  maj11: 'maj11',
  maj13: 'maj13',
  m6: 'm6',
  m69: 'm69',
  m7: 'm7',
  m7b5: 'm7b5',
  m9: 'm9',
  m11: 'm11',
  mmaj7: 'mMaj7',
  mmaj9: 'mMaj9',
  add9: 'add9',
  madd9: 'madd9',
};

/** A chord type's pitch set (on C) → its chords-db suffix, so CM7, CΔ7 and Cmaj7 all find maj7. */
const SUFFIX_BY_CHROMA = new Map(
  Object.entries(BOOK_SUFFIXES).map(([book, ours]) => [Chord.get(`C${ours}`).chroma, book]),
);

/** The chords-db suffix for what follows the root, or null if it names no chord the book has. */
function bookSuffix(text: string): string | null {
  const exact = Object.entries(BOOK_SUFFIXES).find(
    ([book, ours]) => ours === text || book === text,
  );
  if (exact) return exact[0];
  const chord = Chord.get(`C${text}`);
  return chord.empty ? null : (SUFFIX_BY_CHROMA.get(chord.chroma) ?? null);
}

/** Tidy typed input: drop spaces, swap ♭ ♯ Δ for b # maj7, and capitalise the root (`f♯ m7` → `F#m7`). */
export function normaliseSymbol(input: string): string {
  const text = input
    .replace(/\s+/g, '')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/Δ7?/g, 'maj7');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type DotLabels = 'degrees' | 'names';

export interface BookVoicing {
  readonly voicing: ChordVoicing;
  /** Where it sits: `frets 1–3`, `open strings`. */
  readonly where: string;
  /** Low string first, with octaves, for playback. */
  readonly notes: readonly string[];
  /** The shape as taps, for "Show on the neck". */
  readonly picked: Picked;
}

const FINGERS: Readonly<Record<number, Finger>> = { 1: 1, 2: 2, 3: 3, 4: 4 };

/** A chords-db position as a diagram voicing in standard tuning, styled and labelled by degree. */
export function bookVoicing(
  position: BookPosition,
  tones: ReadonlyMap<number, ChordTone>,
  labels: DotLabels = 'degrees',
): BookVoicing {
  const notes: ChordDiagramNote[] = [];
  const picked = new Map<number, number>();
  position.frets.forEach((rel, i) => {
    if (rel < 0) return;
    const string = position.frets.length - i;
    const fret = rel === 0 ? 0 : position.baseFret + rel - 1;
    const tone = toneAt(tones, midiAt({ string, fret }) % 12);
    const note: ChordDiagramNote = {
      string,
      fret,
      style: tone.style === 'added' ? 'tone' : tone.style,
      label: labels === 'names' ? tone.pc : tone.degree,
    };
    const finger = FINGERS[position.fingers[i] ?? 0];
    if (finger !== undefined && fret > 0) note.finger = finger;
    notes.push(note);
    picked.set(string, fret);
  });
  const fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
  const low = Math.min(...fretted);
  const high = Math.max(...fretted);
  const where =
    fretted.length === 0 ? 'open strings' : low === high ? `fret ${low}` : `frets ${low}–${high}`;
  return {
    voicing: { notes },
    where,
    notes: notes.map((n) => noteAt(n).name),
    picked,
  };
}

export type VoicingLookup =
  | {
      readonly ok: true;
      /** The chord the voicings are of, spelled from the typed root: `Bbm7`, `C/E`. */
      readonly symbol: string;
      readonly voicings: readonly BookVoicing[];
      /** Said when the voicings aren't quite what was asked, e.g. no shape with that bass. */
      readonly note: string | null;
    }
  | { readonly ok: false; readonly message: string };

/** A position's sounding MIDI notes, low string first. */
function midisOf(position: BookPosition): number[] {
  return position.frets.flatMap((rel, i) => {
    if (rel < 0) return [];
    const string = position.frets.length - i;
    return [midiAt({ string, fret: rel === 0 ? 0 : position.baseFret + rel - 1 })];
  });
}

/** A position's sounding chromas, low string first. */
function chromasOf(position: BookPosition): number[] {
  return midisOf(position).map((m) => m % 12);
}

/** The chroma of a position's lowest-pitched note (not always on its lowest string). */
export function bassOf(position: BookPosition): number {
  return Math.min(...midisOf(position)) % 12;
}

/**
 * Chords whose book voicings add notes tonal's spelling leaves out (the 3rd
 * of an 11th chord, the 11th of a 13th, the b5 of an alt chord). In every
 * other chord a note outside the chord is a slip in the book (its E madd9
 * shapes sound F madd9), so those shapes are left out.
 */
const FILLED_OUT: ReadonlySet<string> = new Set(['11', '13', 'maj13', 'alt']);

/**
 * Voicings for a typed chord symbol. The root is matched by pitch (Db finds
 * the book's C#) but keeps the spelling typed. A slash chord uses the book's
 * own slash shapes, or the plain chord's shapes with that bass, or failing
 * both the plain chord's shapes, saying so.
 */
export function lookUpVoicings(
  input: string,
  labels: DotLabels = 'degrees',
  book: ChordBook = BOOK,
): VoicingLookup {
  const text = normaliseSymbol(input);
  if (!text) return { ok: false, message: 'Type a chord symbol, such as Am7 or F#.' };
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(text);
  const root = m?.[1];
  const suffix = root === undefined ? null : bookSuffix(m?.[2] ?? '');
  if (root === undefined || suffix === null) {
    const known = root !== undefined && !Chord.get(text).empty;
    return {
      ok: false,
      message: known
        ? `The chord book has no voicings for ${text}.`
        : `“${input.trim()}” isn’t a chord symbol FretFree knows. Try one like Am7, F#m or Bb7.`,
    };
  }
  const bass = m?.[3] ?? null;
  const plain = `${root}${BOOK_SUFFIXES[suffix]}`;
  const key = book.keys.find((k) => chromaOf(k) === chromaOf(root)) as string;
  const chords = book.chords[key.replace('#', 'sharp')] ?? [];
  const tones = chordTones(plain);
  const fits = (p: BookPosition) =>
    FILLED_OUT.has(suffix) || chromasOf(p).every((c) => tones.has(c));
  const shapes = chords.find((c) => c.suffix === suffix)?.positions.filter(fits) ?? [];
  if (shapes.length === 0) {
    return { ok: false, message: `The chord book has no voicings for ${plain}.` };
  }

  let positions: readonly BookPosition[] = shapes;
  let symbol = plain;
  let note: string | null = null;
  if (bass !== null) {
    const slashPrefix = suffix === 'major' ? '/' : suffix === 'minor' ? 'm/' : null;
    const slash = chords.find(
      (c) =>
        slashPrefix !== null &&
        c.suffix.startsWith(slashPrefix) &&
        c.suffix.length > slashPrefix.length &&
        chromaOf(c.suffix.slice(slashPrefix.length)) === chromaOf(bass),
    );
    const withBass = shapes.filter((p) => bassOf(p) === chromaOf(bass));
    const slashShapes = (slash?.positions ?? []).filter((p) =>
      chromasOf(p).every((c) => tones.has(c) || c === chromaOf(bass)),
    );
    if (slashShapes.length > 0) positions = slashShapes;
    else if (withBass.length > 0) positions = withBass;
    if (positions !== shapes) symbol = `${plain}/${bass}`;
    else note = `The chord book has no ${plain}/${bass} shape, so these are ${plain} shapes.`;
  }
  return { ok: true, symbol, voicings: positions.map((p) => bookVoicing(p, tones, labels)), note };
}

// ---------------------------------------------------------------------------
// "Quiz me on this"

/** Skills whose items all spell chords or find chord tones (C5); with a kind, those that drill it. */
export function chordSkillIds(
  skills: readonly Skill[],
  kind: ParsedChord['kind'] | null,
): string[] {
  return skills
    .filter((s) => {
      const refs = s.items().map((i) => parseItemId(i.id));
      const chords = refs.map((r) =>
        r?.kind === 'spell-chord' || r?.kind === 'chord-tone' || r?.kind === 'chord-tone-name'
          ? r.chord
          : null,
      );
      return (
        chords.length > 0 &&
        chords.every((c) => c !== null) &&
        (kind === null || chords.includes(kind))
      );
    })
    .map((s) => s.id);
}

/** The chord as a C5 kind and root (`Am7/C` → A m7), or null for a chord C5 doesn't teach. */
function c5Chord(symbol: string): ParsedChord | null {
  const { root, type } = splitSymbol(symbol);
  try {
    return parseChord(`${root}${type}`);
  } catch {
    return null;
  }
}

/** True when an item drills this chord: spelling it on its root, or its tones in any key. */
function itemDrillsChord(itemId: string, chord: ParsedChord): boolean {
  const r = parseItemId(itemId);
  if (r?.kind === 'spell-chord') {
    return r.chord === chord.kind && chromaOf(r.root) === chromaOf(chord.root);
  }
  return (r?.kind === 'chord-tone' || r?.kind === 'chord-tone-name') && r.chord === chord.kind;
}

/**
 * "Quiz me on this" (design §7): a focused session on the chord on show,
 * spelling it on its root and finding its tones (C5). Gating stays on
 * (research/02 rule 7): until those skills are open the quiz walks back
 * through the gates each still waits for (`statuses`, M10-02: intervals,
 * keys) and offers the nearest open ones, and failing that the notes on the
 * neck. A chord C5 doesn't teach (C6, Cmaj9) quizzes chord construction in
 * general. Skills are found by what they drill, so new ones join without
 * editing this.
 */
export function chordQuizFocus(
  symbol: string | null,
  statuses: ReadonlyMap<string, SkillStatus> = new Map(),
  skills: readonly Skill[] = SKILLS,
): Partial<SessionFocus> {
  const chord = symbol ? c5Chord(symbol) : null;
  const frontier = new Set(
    skills.filter((s) => isFrontier(statuses.get(s.id) ?? 'locked')).map((s) => s.id),
  );
  let targets = chordSkillIds(skills, chord?.kind ?? null);
  if (targets.length === 0) targets = chordSkillIds(skills, null);
  const open = nearestOpenSkills(targets, frontier, skills, statuses);
  if (!open) return { skillIds: noteSkillIds(skills) };
  // Open chord skills narrow to this chord's items; a walk-back keeps its skills.
  const itemIds =
    chord && open.every((id) => targets.includes(id))
      ? skills
          .filter((s) => open.includes(s.id))
          .flatMap((s) => s.items())
          .filter((i) => itemDrillsChord(i.id, chord))
          .map((i) => i.id)
      : [];
  return itemIds.length > 0 ? { itemIds } : { skillIds: open };
}

// ---------------------------------------------------------------------------
// The view

type DotMode = 'fingers' | 'degrees' | 'names';

const DOT_MODES: readonly { mode: DotMode; label: string }[] = [
  { mode: 'fingers', label: 'Fingers' },
  { mode: 'degrees', label: 'Degrees' },
  { mode: 'names', label: 'Note names' },
];

const LEGEND: Readonly<Record<DegreeStyle, string>> = {
  root: 'Root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  added: 'Added note',
};

/** The neck: the explorer's 15 frets, or more when a shape sits higher. */
function neckRange(picked: Picked): FretRange {
  return { from: EXPLORER_RANGE.from, to: Math.max(EXPLORER_RANGE.to, ...picked.values()) };
}

export function View() {
  const settings = useAppStore((s) => s.settings);
  const { handedness, accidentalPref } = settings;
  const tuning = getTuning(settings.tuning);
  const standard = tuning.id === STANDARD_TUNING.id;
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState<Picked>(() => new Map());
  const [typed, setTyped] = useState('C');
  const [asked, setAsked] = useState('C');
  const [dots, setDots] = useState<DotMode>('fingers');
  const dotGroup = useId();
  const tapHeading = useId();
  const voicingHeading = useId();
  const neck = useRef<HTMLDivElement>(null);

  const notes = useMemo(
    () => pickedNotes(picked, tuning, accidentalPref),
    [picked, tuning, accidentalPref],
  );
  const readings = useMemo(() => readChord(bassFirst(notes)), [notes]);
  const reading = readings[0] ?? null;
  const tones = useMemo(() => (reading ? chordTones(reading.symbol) : null), [reading]);
  const markers = pickedMarkers(notes, tones);
  const legend = (['root', 'third', 'fifth', 'seventh', 'added'] as const).filter((s) =>
    notes.some((n) => tones?.get(chromaOf(n.pc))?.style === s),
  );
  const lookup = useMemo(
    () => lookUpVoicings(asked, dots === 'names' ? 'names' : 'degrees'),
    [asked, dots],
  );
  const statuses = useSkillStatuses();
  const quizHref = focusHref(
    chordQuizFocus(reading?.symbol ?? (lookup.ok ? lookup.symbol : null), statuses),
  );
  const sound = { muted: !settings.soundOn, volume: settings.volume };

  const tap = (pos: Position) => {
    if (picked.get(pos.string) !== pos.fret) {
      void playNotes([noteAt(pos, tuning).name], { ...sound, gap: 0 });
    }
    setPicked(togglePick(picked, pos));
  };

  const strum = (names: readonly string[]) => void playNotes(names, { ...sound, gap: STRUM_GAP });

  const showVoicingsOf = (symbol: string) => {
    setTyped(symbol);
    setAsked(symbol);
  };

  const putOnNeck = (v: BookVoicing) => {
    setPicked(v.picked);
    strum(v.notes);
    neck.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className={css.controls}>
        <p className={own.intro}>
          Tap notes to name a chord, or type a chord to see how to play it.
        </p>
        <Link to={quizHref} className={`${styles.secondaryButton} ${css.quiz}`}>
          Quiz me on this
        </Link>
      </div>

      <section className={own.part} aria-labelledby={tapHeading}>
        <h2 id={tapHeading} className={styles.sectionTitle}>
          Name a chord
        </h2>
        <div className={css.summary}>
          <p className={own.reading} aria-live="polite" data-testid="chord-name">
            {reading ? (
              <>
                <strong>{reading.symbol}</strong>
                {reading.name && <span className={styles.muted}> ({reading.name})</span>}
              </>
            ) : notes.length < 2 ? (
              'Tap at least two notes, one per string. Tap a note again to lift it.'
            ) : (
              'These notes don’t make a chord FretFree can name.'
            )}
          </p>
          {readings.length > 1 && (
            <p className={styles.muted} data-testid="chord-alternatives">
              Also read as{' '}
              {readings
                .slice(1)
                .map((r) => r.symbol)
                .join(', ')}
            </p>
          )}
          {notes.length > 0 && (
            <ul className={css.tones} aria-label="Notes, low to high" data-testid="chord-notes">
              {notes.map((n) => {
                const tone = tones?.get(chromaOf(n.pc));
                return (
                  <li key={n.string}>
                    <strong>{tone?.pc ?? n.pc}</strong>
                    {tone && <span> {tone.degree}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {legend.length > 0 && (
            <ul className={`${css.legend} ${own.legend}`} aria-label="Legend">
              {legend.map((s) => (
                <li key={s}>
                  <Swatch style={NECK_STYLE[s]} />
                  {LEGEND[s]}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={own.actions}>
          <button
            type="button"
            className={own.primary}
            disabled={notes.length === 0}
            onClick={() => strum(notes.map((n) => n.name))}
          >
            Play
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={notes.length === 0}
            onClick={() => setPicked(new Map())}
          >
            Clear
          </button>
          {reading && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => showVoicingsOf(reading.symbol)}
            >
              Voicings of {reading.symbol}
            </button>
          )}
        </div>
        <div className={styles.neckScroll} ref={neck}>
          <Fretboard
            tuning={tuning}
            fretRange={neckRange(picked)}
            handedness={handedness}
            markers={markers}
            guideLevel={3}
            accidentalPref={accidentalPref}
            onTapCell={tap}
            cellLabel={(pos) =>
              `${cellLabel(pos, { tuning, pref: accidentalPref, revealNote: true })}${
                picked.get(pos.string) === pos.fret ? ', picked' : ''
              }`
            }
            label={reading ? `Neck: ${reading.symbol} picked` : 'Neck: tap notes to name a chord'}
          />
        </div>
      </section>

      <section className={own.part} aria-labelledby={voicingHeading}>
        <h2 id={voicingHeading} className={styles.sectionTitle}>
          Find voicings
        </h2>
        <form
          className={own.lookup}
          onSubmit={(e) => {
            e.preventDefault();
            setAsked(typed);
          }}
        >
          <label className={`${css.field} ${own.symbol}`}>
            <span>Chord symbol</span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Am7"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
          <button type="submit" className={own.primary}>
            Show voicings
          </button>
          <fieldset className={css.segmented}>
            <legend>Dots show</legend>
            {DOT_MODES.map((m) => (
              <label key={m.mode}>
                <input
                  type="radio"
                  name={dotGroup}
                  value={m.mode}
                  checked={dots === m.mode}
                  onChange={() => setDots(m.mode)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </fieldset>
        </form>

        <div aria-live="polite" data-testid="voicings-status">
          {lookup.ok ? (
            <p className={own.status}>
              <strong>{lookup.symbol}</strong>: {lookup.voicings.length}{' '}
              {lookup.voicings.length === 1 ? 'voicing' : 'voicings'}
              {lookup.note && <span className={own.note}> {lookup.note}</span>}
            </p>
          ) : (
            <p className={own.status}>{lookup.message}</p>
          )}
        </div>
        {!standard && <p className={styles.muted}>Voicings are shown in standard tuning.</p>}
        {lookup.ok && (
          <ul className={own.voicings} aria-label={`Voicings of ${lookup.symbol}`}>
            {lookup.voicings.map((v, i) => (
              <li key={`${lookup.symbol}-${i}`} className={own.card}>
                <ChordDiagram
                  voicing={v.voicing}
                  handedness={handedness}
                  name={lookup.symbol}
                  dotText={dots === 'fingers' ? 'finger' : 'label'}
                  guideLevel={3}
                />
                <p className={own.where}>{v.where}</p>
                <div className={own.cardActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    aria-label={`Play ${lookup.symbol}, ${v.where}`}
                    onClick={() => strum(v.notes)}
                  >
                    Play
                  </button>
                  {standard && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      aria-label={`Show ${lookup.symbol}, ${v.where}, on the neck`}
                      onClick={() => putOnNeck(v)}
                    >
                      On the neck
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className={own.credit}>
          Voicings from{' '}
          <a href="https://github.com/tombatossals/chords-db" target="_blank" rel="noreferrer">
            chords-db
          </a>{' '}
          by David Rubert, MIT licence.
        </p>
      </section>
    </>
  );
}
