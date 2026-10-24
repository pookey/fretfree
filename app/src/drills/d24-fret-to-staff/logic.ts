import { staffConcept } from '../../engine/items/staff';
import { positionNaturals } from '../../engine/skills/r2';
import type { GuideLevel, Item } from '../../engine/model';
import type { PositionRange } from '../../components/staff';
import {
  allStrings,
  describeStaffPosition,
  fretForNote,
  midiAt,
  noteAtStaffPosition,
  parseReadingPosition,
  samePosition,
  staffNote,
  staffPositions,
  type FretRange,
  type Position,
  type ReadingPosition,
  type Tuning,
} from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import { d22At, d22Distance } from '../d22-staff-name/logic';
import { d23PositionName, d23Region } from '../d23-staff-to-fret/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D24_MAX_LEDGERS, D24_SCOPES, d24Parse, type D24Scope } from './meta';

export {
  D24_ID,
  D24_MAX_LEDGERS,
  D24_SCOPE,
  D24_SCOPES,
  d24CanTest,
  d24ConceptOf,
  d24Parse,
  type D24Scope,
} from './meta';

/**
 * D24 "Fretboard → staff" (design §6, §12; research/03 R2): a fret lit in a
 * reading position; the learner taps its note's line or space on the staff.
 * The reverse of D23 (research/02 rule 1), on R2's `fret→staff:G3@pos5`
 * cards.
 *
 * The card is a pitch within the position, not a cell. Where the position's
 * frets play a pitch twice (9th position's two stretches give F3, G4 and C5
 * a second cell), either cell may be lit, and both are the same card: the
 * answer is graded by the place the pitch has on the staff, whichever cell
 * showed it. Varying the cell is rule 12's varied context; the place stays
 * one.
 *
 * Notes are sounding pitches, as everywhere in `theory/` (`G3` is the open
 * 3rd string, written on the 2nd line of the treble 8vb staff).
 */

/** R1's reach, which the staff never goes past: low E (−7) to the space above the 3rd ledger line. */
const REACH = staffPositions(D24_MAX_LEDGERS);
export const D24_LOWEST = REACH[0] as number;
export const D24_HIGHEST = REACH[REACH.length - 1] as number;

export interface D24Prompt {
  itemId: string;
  /** Sounding pitch: `G3`. */
  note: string;
  midi: number;
  /** Its staff place (0 = bottom line, odd numbers spaces): the answer. */
  place: number;
  position: ReadingPosition;
  /** The lit cell. */
  cell: Position;
  /** Every cell in the drawn frets that plays the note, the lit one first. */
  cells: Position[];
  /** The frets the position plays, which the neck draws. */
  region: FretRange;
  scope: D24Scope;
  /** The staff places that take a tap. */
  range: PositionRange;
  tuning: Tuning;
}

/** The answer is the tapped staff place. */
export type D24Answer = number;

export function d24ScopeFor(level: number): D24Scope {
  const i = Math.max(0, Math.min(D24_SCOPES.length - 1, Math.round(level)));
  return D24_SCOPES[i] as D24Scope;
}

/**
 * The places a staff takes taps on: the position's notes and a step beyond
 * each end, or R1's whole reach at the wider scope. Per position, not per
 * note, so the range gives nothing away.
 */
export function d24Range(
  position: ReadingPosition,
  scope: D24Scope,
  tuning: Tuning,
): PositionRange {
  if (scope === 'reading') return [D24_LOWEST, D24_HIGHEST];
  const places = positionNaturals(position, tuning).map((n) => n.staff);
  return [
    Math.max(D24_LOWEST, Math.min(...places) - 1),
    Math.min(D24_HIGHEST, Math.max(...places) + 1),
  ];
}

/** Every cell within `frets` that plays this pitch, high string first. */
export function d24CellsOf(midi: number, frets: FretRange, tuning: Tuning): Position[] {
  const out: Position[] = [];
  for (const string of allStrings(tuning)) {
    for (let fret = frets.from; fret <= frets.to; fret++) {
      if (midiAt({ string, fret }, tuning) === midi) out.push({ string, fret });
    }
  }
  return out;
}

export function d24MakePrompt(item: Item, ctx: DrillContext): D24Prompt {
  const card = d24Parse(item);
  const position = card && parseReadingPosition(card.position);
  const own = card && position && fretForNote(card.note, position, { tuning: ctx.tuning });
  if (!card || !position || !own) throw new Error(`D24 cannot test item ${item.id}`);
  const n = staffNote(card.note);
  const region = d23Region(position, ctx.tuning);
  // The position's own cell first, then any other in its frets (9th position).
  const others = d24CellsOf(n.midi, region, ctx.tuning).filter((c) => !samePosition(c, own));
  const cells = [own, ...others];
  const cell = cells[Math.min(cells.length - 1, Math.floor(ctx.rng() * cells.length))] as Position;
  const scope = d24ScopeFor(ctx.scopeLevel);
  return {
    itemId: item.id,
    note: n.name,
    midi: n.midi,
    place: n.position,
    position,
    cell,
    cells: [cell, ...cells.filter((c) => !samePosition(c, cell))],
    region,
    scope,
    range: d24Range(position, scope, ctx.tuning),
    tuning: ctx.tuning,
  };
}

/** The tapped place, if it is a place on this staff. */
function tappedPlace(prompt: D24Prompt, answer: D24Answer): number | null {
  return Number.isInteger(answer) && answer >= prompt.range[0] && answer <= prompt.range[1]
    ? answer
    : null;
}

export function d24Check(prompt: D24Prompt, answer: D24Answer): DrillCheck {
  const expected = `${displayPc(prompt.note)}, ${d22At(prompt.place)}`;
  const concept = staffConcept(prompt.place);
  if (answer === prompt.place) return { correct: true, expected, concept };
  const place = tappedPlace(prompt, answer);
  // A tap on another place is that place confused with this one, the line
  // for the space beside it most often (engine/confusions.ts pairs them).
  return place === null
    ? { correct: false, expected, concept }
    : { correct: false, expected, concept, confusedWith: staffConcept(place) };
}

/** Stored as `answerGiven`: the tapped place, `pos7`, as D22 logs it. */
export function d24DescribeAnswer(answer: D24Answer): string {
  return `pos${answer}`;
}

/** The note the tapped place names, when the answer was wrong. */
export function d24GivenNote(prompt: D24Prompt, fb: DrillFeedback<D24Answer>): string | null {
  if (fb.result.correct) return null;
  const place = tappedPlace(prompt, fb.answer);
  return place === null ? null : noteAtStaffPosition(place);
}

/** The note lit, and the one the tapped place names when it was wrong (research/02 rule 10). */
export function d24Sounds(prompt: D24Prompt, fb: DrillFeedback<D24Answer>): DrillSounds {
  const given = d24GivenNote(prompt, fb);
  return given === null ? { expected: [prompt.note] } : { expected: [prompt.note], given: [given] };
}

/**
 * The neck in feedback: the lit cell and any other in the position that plays
 * it, and on a miss where the position plays the note the tap named, so the
 * two places on the staff meet their two frets.
 */
export function d24FeedbackPositions(
  prompt: D24Prompt,
  fb: DrillFeedback<D24Answer>,
  tuning: Tuning = prompt.tuning,
): { expected: Position[]; given: Position[] } {
  const given = d24GivenNote(prompt, fb);
  return {
    expected: prompt.cells,
    given: given === null ? [] : d24CellsOf(staffNote(given).midi, prompt.region, tuning),
  };
}

// --- Words ------------------------------------------------------------------

/** "string 4, fret 5", "the open 3rd string". */
export function d24CellName(cell: Position): string {
  if (cell.fret === 0) return `the open ${ordinal(cell.string)} string`;
  return `string ${cell.string}, fret ${cell.fret}`;
}

function ordinal(n: number): string {
  return `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
}

function capitalise(s: string): string {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** The position's name and frets: "5th position, frets 5–8". */
export function d24PositionCaption(prompt: D24Prompt): string {
  const { position } = prompt;
  return `${capitalise(d23PositionName(position))}, frets ${position.frets.from}–${position.frets.to}`;
}

/** The question: "Place string 4, fret 5 on the staff". */
export function d24Task(prompt: D24Prompt): string {
  return `Place ${d24CellName(prompt.cell)} on the staff`;
}

/** "String 4, fret 5 is G3, on the 2nd line." */
export function d24Where(prompt: D24Prompt): string {
  return `${capitalise(d24CellName(prompt.cell))} is ${displayPc(prompt.note)}, ${d22At(prompt.place)}.`;
}

/** The worked example (research/02 rule 8): the note, its place marked, and what to tap. */
export function d24WorkedExample(prompt: D24Prompt): string {
  return `${capitalise(d24CellName(prompt.cell))} is ${displayPc(prompt.note)}, ${d22At(prompt.place)}, marked. Tap it to continue.`;
}

/**
 * One line of feedback: the lit cell's note and its place, so sight, name and
 * sound come together (rule 10). A miss names the tapped place's note, how
 * far it is from the right one, and where the position plays it.
 */
export function d24Explain(prompt: D24Prompt, fb: DrillFeedback<D24Answer>): string {
  const where = d24Where(prompt);
  const given = d24GivenNote(prompt, fb);
  if (given === null) return where;
  const place = fb.answer;
  const away = d22Distance(prompt.place, place);
  // Where the position plays the tapped note: its own fret, as D23 names it.
  const at = fretForNote(given, prompt.position, { tuning: prompt.tuning });
  const played = at ? `, played on ${d24CellName(at)}` : '';
  return `You tapped the ${describeStaffPosition(place)}: that's ${displayPc(given)}, ${away}${played}. ${where}`;
}

/**
 * The neck's guide level. The fret numbers and string names are part of the
 * question (which cell is lit), not a guide to its answer, so they stay at
 * every level; the worked example labels the lit cell (rule 8).
 */
export function d24NeckGuideLevel(guideLevel: GuideLevel, opts: { guided: boolean }): GuideLevel {
  return opts.guided ? 3 : (Math.max(2, guideLevel) as GuideLevel);
}
