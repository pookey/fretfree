import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../theory';
import { d8Check, d8DegreeLabel, d8DegreeStyle, d8MakePrompt, d8Targets } from './logic';
import { d8FeedbackMarkers, d8PromptMarkers } from './markers';

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const at = (p: { ringed: { string: number; fret: number } | null }) => ({
  string: p.ringed!.string,
  fret: p.ringed!.fret,
});

const prompt = (id: string, rng = seq(0, 0.75)) =>
  d8MakePrompt(
    { id, skillId: 'C5.tones-roots' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

// Every 7th-chord kind and every degree, tap and name, at both roots' shapes.
const IDS = ['1', 'b3', '5', 'b7'].flatMap((d) => [
  `chord-tone:${d}@m7`,
  `chord-tone-name:${d}@m7`,
]);

describe('d8PromptMarkers in a worked example', () => {
  it.each(IDS)('draws every note of %s by its degree shape and label', (id) => {
    const p = prompt(id, seq(0.2, 0.75, 0));
    const markers = d8PromptMarkers(p, true, true);
    expect(markers).toHaveLength(p.notes.length);
    p.notes.forEach((n, i) => {
      expect(markers[i]).toMatchObject({
        string: n.string,
        fret: n.fret,
        style: d8DegreeStyle(n.degree),
        label: d8DegreeLabel(n.degree),
        forceLabel: true,
      });
    });
    // No target style replaces a shape, and every label is a degree, never a letter.
    expect(markers.some((m) => m.style === 'target' || m.style === 'tone')).toBe(false);
    expect(markers.every((m) => /^(R|♭?\d)$/.test(m.label ?? ''))).toBe(true);
  });

  it('rings exactly the notes to tap, on top of their shapes', () => {
    const p = prompt('chord-tone:5@major', seq(0.2, 0.75));
    const ringed = d8PromptMarkers(p, true, true).filter((m) => m.emphasis);
    expect(ringed).toHaveLength(d8Targets(p).length);
    expect(ringed.length).toBeGreaterThan(1);
    expect(ringed.every((m) => m.style === 'fifth' && m.label === '5')).toBe(true);
  });

  it('rings the note to name, a root keeping its square', () => {
    const p = prompt('chord-tone-name:1@major', seq(0.2, 0.75, 0));
    const ringed = d8PromptMarkers(p, false, true).filter((m) => m.emphasis);
    expect(ringed).toEqual([
      expect.objectContaining({ ...at(p), style: 'root', label: 'R', spokenLabel: 'root' }),
    ]);
  });
});

describe('d8PromptMarkers in a recall prompt', () => {
  it('keeps the asked degree hidden: plain dots, letter names, no ring', () => {
    const p = prompt('chord-tone:b3@m7');
    const markers = d8PromptMarkers(p, true, false);
    expect(markers.some((m) => m.emphasis)).toBe(false);
    expect(new Set(markers.map((m) => m.style))).toEqual(new Set(['root', 'tone']));
    expect(markers.find((m) => m.style === 'root')?.label).toBe('A');
  });

  it('rings the note to name without a label, and leaves the rest as guides', () => {
    const p = prompt('chord-tone-name:b3@minor', seq(0.2, 0.75, 0));
    const markers = d8PromptMarkers(p, false, false);
    expect(markers.filter((m) => m.style === 'target')).toEqual([
      { ...at(p), group: 'd8-shape', style: 'target' },
    ]);
    expect(markers.filter((m) => m.style !== 'target').every((m) => m.style === 'ghost')).toBe(
      true,
    );
  });
});

describe('d8FeedbackMarkers', () => {
  it('marks the answer correct and a wrong tap in the shape, by degree', () => {
    const p = prompt('chord-tone:b3@m7');
    const fifth = { string: 4, fret: 2 };
    const markers = d8FeedbackMarkers(p, fifth, d8Check(p, fifth).correct);
    expect(markers.find((m) => m.style === 'wrong')).toMatchObject({ ...fifth, label: '5' });
    expect(markers.find((m) => m.style === 'correct')).toMatchObject({ label: '♭3' });
    expect(markers.every((m) => m.forceLabel)).toBe(true);
  });

  it('names a wrong tap off the shape by its note', () => {
    const p = prompt('chord-tone:b3@m7');
    const off = { string: 1, fret: 8 };
    const markers = d8FeedbackMarkers(p, off, false);
    expect(markers.at(-1)).toEqual({ ...off, style: 'wrong', label: 'C', forceLabel: true });
  });

  it('marks the ringed note correct after a named answer', () => {
    const p = prompt('chord-tone-name:b3@minor', seq(0.2, 0.75, 0));
    const markers = d8FeedbackMarkers(p, 'b3', true);
    expect(markers.filter((m) => m.style === 'correct')).toEqual([
      expect.objectContaining({ ...at(p), label: '♭3' }),
    ]);
  });
});
