import { describe, expect, it } from 'vitest';
import { STEM_DX, layoutBar } from './sheet';

describe('bar layout', () => {
  it('spaces notes by time, so a pickup is narrower than a full bar', () => {
    const pickup = layoutBar('4', '4/4');
    const full = layoutBar('4 4 4 4', '4/4');
    expect(pickup.width).toBeLessThan(full.width);
    const xs = full.notes.map((n) => n.x);
    expect(xs[1]! - xs[0]!).toBeCloseTo(xs[2]! - xs[1]!);
  });

  it('makes room for the time signature and repeat signs', () => {
    const plain = layoutBar('4 4 4 4', '4/4');
    const first = layoutBar('4 4 4 4', '4/4', { timeSignature: true, repeatStart: true });
    const end = layoutBar('4 4 4 4', '4/4', { repeatEnd: true });
    expect(first.noteStart).toBeGreaterThan(plain.noteStart);
    expect(first.width - plain.width).toBe(first.noteStart - plain.noteStart);
    expect(end.width).toBeGreaterThan(plain.width);
  });

  it('beams eighths within a beat, and flags a lone one', () => {
    const bar = layoutBar('8 8 4 2', '4/4');
    expect(bar.beams).toEqual([[bar.notes[0]!.x + STEM_DX, bar.notes[1]!.x + STEM_DX]]);
    expect(bar.notes.map((n) => n.flags)).toEqual([0, 0, 0, 0]);
    expect(layoutBar('8', '6/8').notes[0]).toMatchObject({ flags: 1, stem: true, hollow: false });
    expect(layoutBar('8 8 8 8 8 8', '6/8').beams).toHaveLength(2);
  });

  it('draws heads hollow for halves and wholes, stems on all but the whole, and dots', () => {
    const [half, dotted] = layoutBar('2 4. 8', '4/4').notes;
    expect(half).toMatchObject({ hollow: true, stem: true, dots: 0 });
    expect(dotted).toMatchObject({ hollow: false, stem: true, dots: 1 });
    expect(layoutBar('1', '4/4').notes[0]).toMatchObject({ hollow: true, stem: false });
  });
});
