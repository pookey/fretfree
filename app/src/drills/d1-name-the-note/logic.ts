import { parseNoteItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  NATURAL_PCS,
  chromaOf,
  chromaToPc,
  isNatural,
  noteAt,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

export { D1_ID, D1_SCOPE, d1CanTest, d1ConceptOf } from './meta';

/** D1 "Name the highlighted note" (design §6) — the pure half of the reference drill. */

export interface D1Prompt {
  itemId: string;
  position: Position;
  expectedPc: string;
  expectedName: string;
  /** Answer buttons, in musical order. */
  choices: string[];
}

/** The answer is a pitch class, as typed or tapped. */
export type D1Answer = string;

export function d1Choices(expectedPc: string, scopeLevel: number, pref: AccidentalPref): string[] {
  if (scopeLevel <= 0 && isNatural(expectedPc)) return [...NATURAL_PCS];
  return Array.from({ length: 12 }, (_, c) => chromaToPc(c, pref));
}

export function d1MakePrompt(item: Item, ctx: DrillContext): D1Prompt {
  const position = parseNoteItemId(item.id);
  if (!position) throw new Error(`D1 cannot test item ${item.id}`);
  const note = noteAt(position, ctx.tuning, ctx.accidentalPref);
  return {
    itemId: item.id,
    position,
    expectedPc: note.pc,
    expectedName: note.name,
    choices: d1Choices(note.pc, ctx.scopeLevel, ctx.accidentalPref),
  };
}

function sameChroma(a: string, b: string): boolean {
  try {
    return chromaOf(a) === chromaOf(b);
  } catch {
    return false;
  }
}

export function d1Check(prompt: D1Prompt, answer: D1Answer): DrillCheck {
  const correct = sameChroma(answer, prompt.expectedPc);
  return correct
    ? { correct, expected: prompt.expectedPc }
    : { correct, expected: prompt.expectedPc, confusedWith: answer };
}

/** The sounding pitch of the chosen answer, in the same octave region as the target. */
function givenPitch(prompt: D1Prompt, answer: string): string | null {
  try {
    const target = chromaOf(prompt.expectedPc);
    const delta = chromaOf(answer) - target;
    const octave = Number(prompt.expectedName.slice(prompt.expectedPc.length));
    const midi =
      (octave + 1) * 12 + target + (delta > 6 ? delta - 12 : delta < -6 ? delta + 12 : delta);
    const pc = answer;
    return `${pc}${Math.floor(midi / 12) - 1}`;
  } catch {
    return null;
  }
}

export function d1Sounds(prompt: D1Prompt, fb: DrillFeedback<D1Answer>): DrillSounds {
  if (fb.result.correct) return { expected: [prompt.expectedName] };
  const given = givenPitch(prompt, fb.answer);
  return given
    ? { expected: [prompt.expectedName], given: [given] }
    : { expected: [prompt.expectedName] };
}

/**
 * When wrong, show where the chosen note actually is on the same string, so
 * both positions are visible (design §7 feedback).
 */
export function d1FeedbackPositions(
  prompt: D1Prompt,
  fb: DrillFeedback<D1Answer>,
  tuning: Tuning,
): { expected: Position[]; given: Position[] } {
  const expected = [prompt.position];
  if (fb.result.correct) return { expected, given: [] };
  let chroma: number;
  try {
    chroma = chromaOf(fb.answer);
  } catch {
    return { expected, given: [] };
  }
  const { string, fret } = prompt.position;
  let best: Position | null = null;
  for (let f = 0; f <= 15; f++) {
    if (noteAt({ string, fret: f }, tuning).chroma !== chroma) continue;
    if (!best || Math.abs(f - fret) < Math.abs(best.fret - fret)) best = { string, fret: f };
  }
  return { expected, given: best ? [best] : [] };
}

export interface D1GuideMark extends Position {
  /** `root`: the string's open note again; `ghost`: a labelled natural. */
  style: 'root' | 'ghost';
  label: string;
}

/**
 * The guides on the target string (design §3.5): level 3 labels its natural
 * notes and highlights its roots (the open-string note's octaves), level 2
 * shows only the roots, levels 1 and 0 show nothing. Fret 0 is named by the
 * string label at the nut, so it gets no marker.
 *
 * No guide shares the target's pitch class: they let the learner work the
 * answer out from its neighbours, never read it off (retrieval practice,
 * research/02).
 */
export function d1GuideMarkers(
  prompt: D1Prompt,
  level: GuideLevel,
  range: FretRange,
  tuning: Tuning,
  pref: AccidentalPref = 'sharp',
): D1GuideMark[] {
  if (level < 2) return [];
  const { string } = prompt.position;
  const target = chromaOf(prompt.expectedPc);
  const open = noteAt({ string, fret: 0 }, tuning).chroma;
  const marks: D1GuideMark[] = [];
  for (let fret = Math.max(1, range.from); fret <= range.to; fret++) {
    const note = noteAt({ string, fret }, tuning, pref);
    if (note.chroma === target) continue;
    if (note.chroma === open) marks.push({ string, fret, style: 'root', label: note.pc });
    else if (level >= 3 && isNatural(note.pc)) {
      marks.push({ string, fret, style: 'ghost', label: note.pc });
    }
  }
  return marks;
}

/**
 * Hardware-keyboard answers (design §7): A–G pick a natural, Shift+letter its
 * sharp (or flat with the flat preference), 1–9 pick a button by position.
 */
export function d1KeyToAnswer(
  key: string,
  shiftKey: boolean,
  choices: readonly string[],
  pref: AccidentalPref,
): string | null {
  if (/^[1-9]$/.test(key)) return choices[Number(key) - 1] ?? null;
  const letter = key.toUpperCase();
  if (!/^[A-G]$/.test(letter)) return null;
  if (!shiftKey) return choices.includes(letter) ? letter : null;
  const chroma = (chromaOf(letter) + (pref === 'sharp' ? 1 : 11)) % 12;
  const pc = chromaToPc(chroma, pref);
  // E♯, B♯, F♭ and C♭ are spelled as naturals: no Shift shortcut for those.
  if (isNatural(pc)) return null;
  return choices.includes(pc) ? pc : null;
}
