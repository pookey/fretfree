import {
  Accidental,
  BarNote,
  Beam,
  Dot,
  Formatter,
  GhostNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  TabNote,
  TabStave,
  Tuplet,
  Voice,
  type Note as VexNote,
} from 'vexflow/bravura';
import type { ShownAccidental } from './accidentals';
import { END_PAD, PAD_X, type StaffGeometry } from './geometry';
import { isRest, type StaffNote, type StaffTuplet } from './model';
import { writtenKey } from './position';

/**
 * The VexFlow half of <Staff>, loaded on demand (see `engraver.ts`) so
 * VexFlow and its Bravura font stay out of first-load JS (design §10).
 * It engraves into a host element and reports where each note landed;
 * <Staff> draws highlights, labels and hit-testing over the top.
 */

export interface EngraveSpec {
  notes: readonly StaffNote[];
  accidentals: readonly (readonly ShownAccidental[])[];
  keySignature: string;
  timeSignature?: string;
  tuplets: readonly StaffTuplet[];
  tab: boolean;
  geometry: StaffGeometry;
  /** Prefix for the note groups' ids, unique on the page: `vf-<prefix>-n<i>`. */
  idPrefix: string;
}

export interface EngravedNote {
  /** Notehead centre x, and each notehead's y (one for a rest). */
  x: number;
  ys: number[];
  /** Horizontal extent of the note, accidentals included. */
  left: number;
  right: number;
}

export interface Engraving {
  width: number;
  notes: EngravedNote[];
  /** Where the notes may sit: from the first note's x to the end of the stave. */
  noteStartX: number;
  noteEndX: number;
}

/** Bravura is embedded in the chunk; wait for it, or VexFlow measures a fallback font. */
export const ready: Promise<void> =
  typeof document !== 'undefined' && 'fonts' in document
    ? document.fonts.load('30pt Bravura').then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();

const dotted = (value: string, dots = 0) => value + 'd'.repeat(dots);

export function engrave(host: HTMLElement, spec: EngraveSpec): Engraving {
  const g = spec.geometry;
  host.replaceChildren();
  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  const ctx = renderer.getContext();

  const stave = new Stave(PAD_X, g.staveY, g.width - 2 * PAD_X);
  stave.addClef('treble', 'default', '8vb');
  if (spec.keySignature !== 'C') stave.addKeySignature(spec.keySignature);
  if (spec.timeSignature) stave.addTimeSignature(spec.timeSignature);
  const tabStave =
    spec.tab && g.tabStaveY !== undefined
      ? new TabStave(PAD_X, g.tabStaveY, g.width - 2 * PAD_X).addTabGlyph()
      : undefined;

  const staveNotes = spec.notes.map((n, i) => {
    const rest = isRest(n);
    const note = new StaveNote({
      keys: rest ? ['b/4'] : (n.pitches ?? []).map(writtenKey),
      duration: `${dotted(n.value, n.dots)}${rest ? 'r' : ''}`,
      clef: 'treble',
      autoStem: true,
    });
    note.setAttribute('id', `${spec.idPrefix}-n${i}`);
    spec.accidentals[i]?.forEach((acc, k) => acc && note.addModifier(new Accidental(acc), k));
    if (n.dots) Dot.buildAndAttach([note], { all: true });
    return note;
  });
  const tabNotes = tabStave
    ? spec.notes.map((n): VexNote => {
        const duration = dotted(n.value, n.dots);
        if (isRest(n) || !n.tab?.length) return new GhostNote(duration);
        return new TabNote({
          positions: n.tab.map((t) => ({ str: t.string, fret: t.fret })),
          duration,
        });
      })
    : [];

  // Tuplets change the notes' ticks, so they come before formatting.
  const tuplets = spec.tuplets.map((t) => {
    const opts = { numNotes: t.count, notesOccupied: t.inSpaceOf ?? 2 };
    if (tabNotes.length) new Tuplet(tabNotes.slice(t.from, t.from + t.count), opts);
    return new Tuplet(staveNotes.slice(t.from, t.from + t.count), opts);
  });

  const withBars = <T>(notes: readonly T[]) =>
    notes.flatMap((n, i) =>
      spec.notes[i]?.barAfter && i < notes.length - 1 ? [n, new BarNote()] : [n],
    );
  const [beats, beatValue] = (spec.timeSignature ?? '4/4').split('/').map(Number);
  const voiceOf = (tickables: VexNote[]) =>
    new Voice({ numBeats: beats ?? 4, beatValue: beatValue ?? 4 })
      .setMode(Voice.Mode.SOFT)
      .addTickables(tickables);
  const voice = voiceOf(withBars(staveNotes));
  const tabVoice = tabStave ? voiceOf(withBars(tabNotes)) : undefined;
  const voices = tabVoice ? [voice, tabVoice] : [voice];

  // Beam within each bar, grouped by the meter's beats.
  const groups = Beam.getDefaultBeamGroups(spec.timeSignature ?? '4/4');
  const beams = bars(spec.notes, staveNotes).flatMap((bar) =>
    Beam.generateBeams(bar, { groups, maintainStemDirections: false }),
  );

  const ties = spec.notes.flatMap((n, i) => {
    const next = spec.notes[i + 1];
    if (!n.tie || !next) return [];
    const from: number[] = [];
    const to: number[] = [];
    (n.pitches ?? []).forEach((p, k) => {
      const j = (next.pitches ?? []).indexOf(p);
      if (j < 0) return;
      from.push(k);
      to.push(j);
    });
    if (from.length === 0) return [];
    return [
      new StaveTie({
        firstNote: staveNotes[i],
        lastNote: staveNotes[i + 1],
        firstIndexes: from,
        lastIndexes: to,
      }),
    ];
  });

  // Line the tab's notes up under the staff's, then size the stave to fit.
  const formatter = new Formatter();
  formatter.joinVoices([voice]);
  if (tabVoice) formatter.joinVoices([tabVoice]);
  const noteStartX = Math.max(stave.getNoteStartX(), tabStave?.getNoteStartX() ?? 0);
  const estimated = g.width - PAD_X - END_PAD - noteStartX;
  const minNotes = spec.notes.length ? formatter.preCalculateMinTotalWidth(voices) * 1.25 : 0;
  const areaW = Math.max(estimated, minNotes);
  const width = Math.ceil(noteStartX + areaW + END_PAD + PAD_X);
  // Resizing re-formats a stave, so the shared note start comes after it.
  stave.setWidth(width - 2 * PAD_X).setNoteStartX(noteStartX);
  tabStave?.setWidth(width - 2 * PAD_X).setNoteStartX(noteStartX);
  if (spec.notes.length) formatter.format(voices, areaW);

  renderer.resize(width, g.height);
  stave.setContext(ctx).draw();
  if (tabStave) {
    // One group for the tab, so guide fading can dim it (class `vf-tab`).
    ctx.openGroup('tab');
    tabStave.setContext(ctx).draw();
    new StaveConnector(stave, tabStave).setType('singleLeft').setContext(ctx).draw();
    if (spec.notes.length) tabVoice?.draw(ctx, tabStave);
    ctx.closeGroup();
  }
  if (spec.notes.length) {
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());
    ties.forEach((t) => t.setContext(ctx).draw());
  }

  // The engraving scales with its box; <Staff> sizes the box.
  const svg = host.querySelector('svg');
  svg?.removeAttribute('width');
  svg?.removeAttribute('height');
  svg?.style.removeProperty('width');
  svg?.style.removeProperty('height');

  return {
    width,
    noteStartX,
    noteEndX: noteStartX + areaW,
    notes: staveNotes.map((note) => {
      const box = note.getBoundingBox();
      return {
        x: (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2,
        ys: note.getYs(),
        left: Math.min(box.getX(), note.getNoteHeadBeginX()),
        right: Math.max(box.getX() + box.getW(), note.getNoteHeadEndX()),
      };
    }),
  };
}

/** Split the engraved notes at the barlines. */
function bars(notes: readonly StaffNote[], engraved: StaveNote[]): StaveNote[][] {
  const out: StaveNote[][] = [[]];
  engraved.forEach((n, i) => {
    out[out.length - 1]?.push(n);
    if (notes[i]?.barAfter) out.push([]);
  });
  return out.filter((b) => b.length > 0);
}
