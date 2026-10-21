import { parseTabItemId } from '../../engine/items/tab';
import type { GuideLevel, Item } from '../../engine/model';
import {
  inRange,
  noteAt,
  samePosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { tabEventLabel, tabLineName } from '../../theory/tab';
import { tabGuide } from '../../components/tab/guide';
import type { TabLineMark, TabNoteStyle } from '../../components/tab/TabStaff';
import { compactWindowFrets, isShortLandscape } from '../../shell/size-class';
import { d2SpanWindow } from '../d2-find-the-note/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D33_SCOPES, d33LineConcept, type D33Scope } from './meta';

export {
  D33_ID,
  D33_SCOPE,
  D33_SCOPES,
  d33CanTest,
  d33ConceptOf,
  d33LineConcept,
  type D33Scope,
} from './meta';

/**
 * D33 "Tab → neck" (docs/design/tab-track.md §6): one note on the tab staff,
 * and the learner taps that cell on the neck. The pure half of the drill.
 * Tab names a place, not a pitch, so only the one cell is right: the same
 * note on another string is a misread line.
 */

const REGION: FretRange = { from: 0, to: 12 };
const NECK: FretRange = { from: 0, to: 15 };

/** The staff is drawn this many columns wide, with the one note in the middle. */
export const D33_STAFF_COLUMNS = 5;

export interface D33Prompt {
  itemId: string;
  /** The cell the tab note names. */
  target: Position;
  scope: D33Scope;
  /** Frets that accept taps. Every string is live. */
  activeRange: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The answer is the tapped cell. */
export type D33Answer = Position;

export function d33ScopeFor(level: number): D33Scope {
  const i = Math.max(0, Math.min(D33_SCOPES.length - 1, Math.round(level)));
  return D33_SCOPES[i] as D33Scope;
}

export function d33MakePrompt(item: Item, ctx: DrillContext): D33Prompt {
  const target = parseTabItemId(item.id);
  if (!target || target.string > stringCount(ctx.tuning)) {
    throw new Error(`D33 cannot test item ${item.id}`);
  }
  const scope = d33ScopeFor(ctx.scopeLevel);
  return {
    itemId: item.id,
    target,
    scope,
    activeRange: scope === 'neck' ? NECK : REGION,
    tuning: ctx.tuning,
    accidentalPref: ctx.accidentalPref,
  };
}

/** True if a tap on this cell is an answer (cells past the live frets are inert). */
export function d33IsLive(prompt: D33Prompt, pos: Position): boolean {
  return (
    pos.string >= 1 &&
    pos.string <= stringCount(prompt.tuning) &&
    inRange(pos.fret, prompt.activeRange)
  );
}

/**
 * Tapping the mirror string (6 for 1, 5 for 2): the tab read upside down,
 * with the low E on top. The middle pair (3 and 4) are neighbours too, so a
 * slip between them counts as a misread neighbour instead.
 */
export function d33UpsideDown(prompt: D33Prompt, answer: Position): boolean {
  const mirror = stringCount(prompt.tuning) + 1 - prompt.target.string;
  return Math.abs(mirror - prompt.target.string) > 1 && answer.string === mirror;
}

export function d33Check(prompt: D33Prompt, answer: D33Answer): DrillCheck {
  const expected = tabEventLabel(prompt.target);
  const concept = d33LineConcept(prompt.target.string);
  if (samePosition(answer, prompt.target)) return { correct: true, expected, concept };
  // A tap on another line's string is a misread line; a wrong fret on the
  // right string is a locating slip, not a line confusion.
  if (d33IsLive(prompt, answer) && answer.string !== prompt.target.string) {
    return { correct: false, expected, concept, confusedWith: d33LineConcept(answer.string) };
  }
  return { correct: false, expected, concept };
}

export function d33DescribeAnswer(answer: D33Answer): string {
  return `s${answer.string}f${answer.fret}`;
}

function nameAt(prompt: D33Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).name;
}

function pcAt(prompt: D33Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).pc;
}

/** The note at the cell, and the one tapped when it was wrong (research/02 rule 10). */
export function d33Sounds(prompt: D33Prompt, fb: DrillFeedback<D33Answer>): DrillSounds {
  const expected = [nameAt(prompt, prompt.target)];
  return fb.result.correct ? { expected } : { expected, given: [nameAt(prompt, fb.answer)] };
}

export function d33FeedbackPositions(
  prompt: D33Prompt,
  fb: DrillFeedback<D33Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: [prompt.target], given: fb.result.correct ? [] : [fb.answer] };
}

/** `1st`, `2nd`, `3rd`: a line's place from the top. */
export function d33Ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "the 3rd line from the top", "the top line", "the bottom line". */
export function d33LinePlace(string: number, tuning: Tuning): string {
  if (string === 1) return 'the top line';
  if (string === stringCount(tuning)) return 'the bottom line';
  return `the ${d33Ordinal(string)} line from the top`;
}

/**
 * One line of feedback: which string the line is, the fret, and the note
 * there, so sight, name and sound come together (rule 10). A wrong tap says
 * which half was wrong: the line, the fret, or both.
 */
export function d33Explain(prompt: D33Prompt, fb: DrillFeedback<D33Answer>): string {
  const { target, tuning } = prompt;
  const line = d33LinePlace(target.string, tuning);
  const where = `${line[0]!.toUpperCase()}${line.slice(1)} is string ${target.string} (${tabLineName(target.string, tuning)}): fret ${target.fret} there is ${pcAt(prompt, target)}.`;
  if (fb.result.correct) return where;
  const { string, fret } = fb.answer;
  const tapped = `You tapped string ${string}, fret ${fret}.`;
  if (d33UpsideDown(prompt, fb.answer)) {
    return `${tapped} That reads the tab upside down: the top line is the high e string. ${where}`;
  }
  if (string === target.string) {
    return `${tapped} Right string; the number says fret ${target.fret}. ${where}`;
  }
  if (fret === target.fret) return `${tapped} Right fret, wrong line. ${where}`;
  return `${tapped} ${where}`;
}

/**
 * The staff's guide level (docs/design/tab-track.md §5). The worked example
 * names every line and its string number; so does feedback, because which
 * string the line is is the answer, and immediate correct-answer feedback
 * stays on at every level (research/02 rule 9).
 */
export function d33StaffGuideLevel(
  guideLevel: GuideLevel,
  opts: { guided: boolean; answered: boolean },
): GuideLevel {
  return opts.guided || opts.answered ? 3 : guideLevel;
}

/**
 * The neck's guide level. Guides fade as usual (design §3.5): the answer is
 * a cell, and no guide level marks one. Only the worked example adds the
 * target marker, so nothing shows the queried cell before the answer
 * (research/02 rule 4, the M1-25 rule).
 */
export function d33NeckGuideLevel(guideLevel: GuideLevel, opts: { guided: boolean }): GuideLevel {
  return opts.guided ? 3 : guideLevel;
}

/** The tab note's style: asked about while open, then correct, or still asked about on a miss. */
export function d33NoteStyle(fb: DrillFeedback<D33Answer> | null): TabNoteStyle {
  return fb?.result.correct ? 'correct' : 'current';
}

/**
 * Line marks: the worked example highlights the note's line; feedback flashes
 * it, and dashes the line of a wrong string tapped.
 */
export function d33LineMarks(
  prompt: D33Prompt,
  opts: { guided: boolean; feedback: DrillFeedback<D33Answer> | null },
): TabLineMark[] {
  const { feedback } = opts;
  const string = prompt.target.string;
  if (feedback) {
    const marks: TabLineMark[] = [{ string, style: 'correct' }];
    if (!feedback.result.correct && feedback.answer.string !== string) {
      marks.push({ string: feedback.answer.string, style: 'wrong' });
    }
    return marks;
  }
  return opts.guided ? [{ string, style: 'selected' }] : [];
}

/**
 * The staff's accessible name. A sighted learner sees the note's place among
 * the lines and only the line names the guide level still shows, so the
 * label gives its place from the top and the same names, never a string
 * number the staff doesn't show: VoiceOver learners recall line → string
 * too (M9-01 review). The fret is the content being read, so it is always
 * said. At level 3 the staff shows string numbers, and so does the label.
 */
export function d33StaffLabel(prompt: D33Prompt, staffLevel: GuideLevel): string {
  const { target, tuning } = prompt;
  const count = stringCount(tuning);
  const guide = tabGuide(staffLevel);
  const head = `Tab, ${count} lines: one note on ${d33LinePlace(target.string, tuning)}`;
  const fret = `at fret ${target.fret}`;
  if (guide.numbers) {
    return `${head}, string ${target.string} (${tabLineName(target.string, tuning)}), ${fret}`;
  }
  if (guide.names === 'all') {
    return `${head}, the ${tabLineName(target.string, tuning)} line, ${fret}`;
  }
  if (guide.names === 'ends') {
    const top = tabLineName(1, tuning);
    const bottom = tabLineName(count, tuning);
    return `${head}, ${fret}. The top line is ${top}, the bottom line ${bottom}`;
  }
  return `${head}, ${fret}`;
}

// --- Compact window -------------------------------------------------------

/**
 * Width the staff takes beside the neck on a phone on its side
 * (D33View.module.css: 9rem tall at the staff's 352 × 318 aspect, plus the
 * column gap).
 */
export const D33_SIDE_STAFF_PX = 172;

/**
 * The compact window's width in frets. The session sizes it for a neck that
 * spans the screen; on a phone on its side the staff sits beside the neck,
 * so the window shrinks to what still fits at the neck's 44pt cells.
 */
export function d33CompactFrets(
  compactFrets: number | undefined,
  width: number,
  height: number,
): number | undefined {
  if (compactFrets === undefined || !isShortLandscape(width, height)) return compactFrets;
  return Math.min(compactFrets, compactWindowFrets(width - D33_SIDE_STAFF_PX, height));
}

/**
 * The first compact window. It starts at the nut so it gives nothing away; a
 * guided rep (a worked example) opens on the target instead.
 */
export function d33InitialWindow(prompt: D33Prompt, guided: boolean, size?: number): FretRange {
  const fret = guided ? prompt.target.fret : prompt.activeRange.from;
  return d2SpanWindow([fret], prompt.activeRange, size);
}
