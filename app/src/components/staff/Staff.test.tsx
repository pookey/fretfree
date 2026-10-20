import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element as VexElement } from 'vexflow/bravura';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { computeStaffGeometry } from './geometry';
import type { StaffNote } from './model';
import { Staff, type StaffProps } from './Staff';

// jsdom has no canvas; give VexFlow a stand-in to measure glyphs with.
beforeAll(() => {
  VexElement.setTextMeasurementCanvas({
    getContext: () => ({
      font: '',
      measureText: (t: string) => ({
        width: 10 * t.length,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 10,
      }),
    }),
  } as unknown as HTMLCanvasElement);
});

const PHRASE: StaffNote[] = [
  { pitches: ['E2'], value: 'q', tab: [{ string: 6, fret: 0 }] },
  { pitches: ['F#2'], value: '8', dots: 1, tab: [{ string: 6, fret: 2 }] },
  { pitches: ['G2'], value: '16', tab: [{ string: 6, fret: 3 }] },
  { value: 'q' },
  { pitches: ['A2'], value: 'q', tie: true, barAfter: true, tab: [{ string: 5, fret: 0 }] },
  { pitches: ['A2'], value: '8', tab: [{ string: 5, fret: 0 }] },
  { pitches: ['B2'], value: '8', tab: [{ string: 5, fret: 2 }] },
  { pitches: ['C3'], value: '8', tab: [{ string: 5, fret: 3 }] },
  { pitches: ['D3'], value: '8', tab: [{ string: 4, fret: 0 }] },
  { pitches: ['E3'], value: '8', tab: [{ string: 4, fret: 2 }] },
  { pitches: ['F#3'], value: '8', tab: [{ string: 4, fret: 4 }] },
  {
    pitches: ['G3', 'B3'],
    value: 'q',
    tab: [
      { string: 3, fret: 0 },
      { string: 2, fret: 0 },
    ],
  },
];

// SMuFL accidentals, as VexFlow draws them (text in the Bravura font).
const SHARP = '\uE262';
const NATURAL = '\uE261';
const glyphs = (el: Element, glyph: string) =>
  [...el.querySelectorAll('text')].filter((t) => t.textContent === glyph).length;

async function renderStaff(props: StaffProps = {}) {
  const view = render(<Staff label="Test staff" {...props} />);
  const staff = screen.getByRole('group', { name: 'Test staff' });
  await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
  const engraving = staff.querySelector('div') as HTMLDivElement;
  return { ...view, staff, engraving };
}

describe('<Staff> rendering', () => {
  it('engraves a treble 8vb clef with key and time signatures', async () => {
    const { engraving } = await renderStaff({ keySignature: 'G', timeSignature: '3/4' });
    expect(engraving.querySelector('svg')).not.toBeNull();
    expect(engraving.querySelectorAll('.vf-clef')).toHaveLength(1);
    expect(engraving.querySelectorAll('.vf-keysignature')).toHaveLength(1);
    expect(engraving.querySelectorAll('.vf-timesignature')).toHaveLength(1);
    // SMuFL gClef8vb: the treble clef with the 8 below.
    expect(engraving.querySelector('.vf-clef')).toHaveTextContent('\uE052');
  });

  it('leaves out the key and time signatures when there are none', async () => {
    const { engraving } = await renderStaff();
    expect(engraving.querySelectorAll('.vf-keysignature')).toHaveLength(0);
    expect(engraving.querySelectorAll('.vf-timesignature')).toHaveLength(0);
  });

  it('engraves notes, rests, dots, beams, ties and tuplets', async () => {
    const { engraving } = await renderStaff({
      notes: PHRASE,
      timeSignature: '4/4',
      tuplets: [{ from: 5, count: 3 }],
    });
    expect(engraving.querySelectorAll('.vf-stavenote')).toHaveLength(PHRASE.length);
    expect(engraving.querySelectorAll('.vf-beam').length).toBeGreaterThanOrEqual(2);
    expect(engraving.querySelectorAll('.vf-tuplet')).toHaveLength(1);
    expect(engraving.querySelectorAll('.vf-stavetie')).toHaveLength(1);
    expect(engraving.querySelectorAll('.vf-stavebarline').length).toBeGreaterThanOrEqual(3);
    // F#2 and F#3 sit in different octaves, so both need a sharp.
    expect(glyphs(engraving, SHARP)).toBe(2);
  });

  it('applies the key signature to accidentals', async () => {
    const { engraving, unmount } = await renderStaff({ notes: PHRASE, keySignature: 'G' });
    // Just the signature's sharp; F#2 and F#3 are in the key.
    expect(glyphs(engraving, SHARP)).toBe(1);
    unmount();
    const f = await renderStaff({ notes: [{ pitches: ['F2'], value: 'q' }], keySignature: 'G' });
    expect(glyphs(f.engraving, NATURAL)).toBe(1);
  });

  it('names every note for VoiceOver', async () => {
    const { staff } = await renderStaff({ notes: PHRASE, tuplets: [{ from: 5, count: 3 }] });
    const notes = within(staff).getAllByRole('img');
    expect(notes).toHaveLength(PHRASE.length);
    expect(notes[0]).toHaveAccessibleName('E 2, quarter note');
    expect(notes[1]).toHaveAccessibleName('F sharp 2, dotted eighth note');
    expect(notes[3]).toHaveAccessibleName('quarter rest');
    expect(notes[4]).toHaveAccessibleName('A 2, quarter note, tied to the next note');
    expect(notes[5]).toHaveAccessibleName('A 2, eighth note, triplet');
    expect(notes[11]).toHaveAccessibleName('G 3 and B 3, quarter-note chord');
  });

  it('describes places instead of names while pitches are hidden', async () => {
    const { staff } = await renderStaff({ notes: PHRASE.slice(0, 2), revealPitches: false });
    const notes = within(staff).getAllByRole('img');
    expect(notes[0]).toHaveAccessibleName('quarter note on space below the 3rd ledger line');
    expect(notes[1]).toHaveAccessibleName('dotted eighth note on 3rd ledger line below, sharp');
  });

  it('places notes left to right and low notes lower', async () => {
    const { staff } = await renderStaff({ notes: PHRASE.slice(0, 3) });
    const xs = within(staff)
      .getAllByRole('img')
      .map((n) => Number(n.getAttribute('data-x')));
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
  });

  it('keeps the engraving out of the accessibility tree', async () => {
    const { engraving } = await renderStaff({ notes: PHRASE });
    expect(engraving).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('<Staff> tab under the staff', () => {
  it('draws tab at high guide levels, with frets in the labels', async () => {
    const { staff, engraving } = await renderStaff({ notes: PHRASE, showTab: true, guideLevel: 3 });
    expect(staff).toHaveAttribute('data-tab', 'full');
    expect(engraving.querySelectorAll('.vf-tab')).toHaveLength(1);
    // Every note but the rest has tab.
    expect(engraving.querySelectorAll('.vf-tab .vf-tabnote')).toHaveLength(PHRASE.length - 1);
    expect(within(staff).getAllByRole('img')[0]).toHaveAccessibleName(
      'E 2, quarter note, string 6, fret 0',
    );
  });

  it('fades the tab at level 1 and drops it at level 0', async () => {
    const faint = await renderStaff({ notes: PHRASE, showTab: true, guideLevel: 1 });
    expect(faint.staff).toHaveAttribute('data-tab', 'faint');
    expect(faint.engraving.querySelectorAll('.vf-tabnote').length).toBeGreaterThan(0);
    faint.unmount();

    const gone = await renderStaff({ notes: PHRASE, showTab: true, guideLevel: 0 });
    expect(gone.staff).toHaveAttribute('data-tab', 'none');
    expect(gone.engraving.querySelectorAll('.vf-tab')).toHaveLength(0);
    expect(within(gone.staff).getAllByRole('img')[0]).toHaveAccessibleName('E 2, quarter note');
  });

  it('is off unless asked for', async () => {
    const { staff, engraving } = await renderStaff({ notes: PHRASE });
    expect(staff).toHaveAttribute('data-tab', 'none');
    expect(engraving.querySelectorAll('.vf-tabnote')).toHaveLength(0);
  });
});

describe('<Staff> highlights', () => {
  it('colours a note and draws its halo, each style its own shape', async () => {
    const notes: StaffNote[] = [
      { pitches: ['E3'], value: 'q', style: 'correct' },
      { pitches: ['G3'], value: 'q', style: 'wrong' },
      { pitches: ['B3'], value: 'q', style: 'target' },
      { pitches: ['D4'], value: 'q', style: 'root' },
    ];
    const { staff, engraving } = await renderStaff({ notes });
    const groups = [...engraving.querySelectorAll('.vf-stavenote')];
    expect(groups.map((g) => g.getAttribute('data-style'))).toEqual([
      'correct',
      'wrong',
      'target',
      'root',
    ]);
    const halos = staff.querySelector('svg[aria-hidden="true"]') as SVGSVGElement;
    expect(halos.querySelectorAll('circle')).toHaveLength(2); // correct, target
    expect(halos.querySelectorAll('rect[transform]')).toHaveLength(1); // wrong: a diamond
    expect(halos.querySelectorAll('rect:not([transform])')).toHaveLength(1); // root: a square
  });

  it('updates highlights without re-engraving', async () => {
    const notes: StaffNote[] = [{ pitches: ['E3'], value: 'q' }];
    const { rerender, engraving } = await renderStaff({ notes });
    const svg = engraving.querySelector('svg');
    rerender(<Staff label="Test staff" notes={[{ ...notes[0]!, style: 'correct' }]} />);
    await waitFor(() =>
      expect(engraving.querySelector('.vf-stavenote')).toHaveAttribute('data-style', 'correct'),
    );
    expect(engraving.querySelector('svg')).toBe(svg);
  });

  it('marks the cursor note with a caret', async () => {
    const { staff } = await renderStaff({ notes: PHRASE.slice(0, 3), cursor: 1 });
    expect(within(staff).getByTestId('staff-cursor')).toHaveAttribute('data-column', '1');
    expect(within(staff).getAllByRole('img')[1]).toHaveAttribute('aria-current', 'step');
    expect(within(staff).getAllByRole('img')[1]).toHaveAttribute('data-style', 'current');
  });

  it('draws position marks with their ledger lines', async () => {
    const { staff } = await renderStaff({
      marks: [
        { position: -7, style: 'wrong' },
        { position: 3, style: 'correct' },
      ],
    });
    const marks = within(staff).getAllByTestId('staff-mark');
    expect(marks.map((m) => m.getAttribute('data-style'))).toEqual(['wrong', 'correct']);
    expect(marks[0]!.querySelectorAll('line')).toHaveLength(3);
    expect(marks[1]!.querySelectorAll('line')).toHaveLength(0);
  });
});

describe('<Staff> hit-testing', () => {
  /** Make the overlay report a box at scale 1, so client coordinates are design units. */
  function sizeOverlay(staff: HTMLElement) {
    const overlay = staff.querySelectorAll('svg')[2] as SVGSVGElement;
    const [, , w, h] = (overlay.getAttribute('viewBox') ?? '').split(' ').map(Number);
    overlay.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
    return overlay;
  }

  it('offers one button per position, named by place', async () => {
    const { staff } = await renderStaff({ onTapPosition: () => {}, positionRange: [-3, 9] });
    const buttons = within(staff).getAllByRole('button');
    expect(buttons).toHaveLength(13);
    expect(buttons[0]).toHaveAccessibleName('space above the staff');
    expect(buttons.at(-1)).toHaveAccessibleName('space below the 1st ledger line');
    expect(within(staff).getByRole('button', { name: 'line 1' })).toHaveAttribute(
      'data-position',
      '0',
    );
    expect(staff).toHaveAttribute('data-interactive', 'true');
  });

  it('has no buttons when not interactive', async () => {
    const { staff } = await renderStaff({ notes: PHRASE });
    expect(within(staff).queryAllByRole('button')).toHaveLength(0);
  });

  it('returns the position under a press, after sliding to it', async () => {
    const onTap = vi.fn();
    const { staff } = await renderStaff({ onTapPosition: onTap, positionRange: [-7, 9] });
    const overlay = sizeOverlay(staff);
    const g = computeStaffGeometry({ notePositions: [], range: [-7, 9] });

    fireEvent.pointerDown(overlay, { clientX: 60, clientY: g.positionY(2) + 1, pointerId: 1 });
    expect(within(staff).getByTestId('staff-ghost')).toHaveAttribute('data-position', '2');
    fireEvent.pointerMove(overlay, { clientX: 60, clientY: g.positionY(-4) - 2, pointerId: 1 });
    const ghost = within(staff).getByTestId('staff-ghost');
    expect(ghost).toHaveAttribute('data-position', '-4');
    expect(ghost.querySelectorAll('line')).toHaveLength(2);
    expect(onTap).not.toHaveBeenCalled();

    fireEvent.pointerUp(overlay, { clientX: 60, clientY: g.positionY(-4) - 2, pointerId: 1 });
    expect(onTap).toHaveBeenCalledWith(-4, { nearestNote: undefined });
    expect(within(staff).queryByTestId('staff-ghost')).toBeNull();
    // The click that follows a pointer pick doesn't pick again.
    fireEvent.click(within(staff).getByRole('button', { name: '2nd ledger line below' }));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('clamps presses beyond the range', async () => {
    const onTap = vi.fn();
    const { staff } = await renderStaff({ onTapPosition: onTap, positionRange: [0, 8] });
    const overlay = sizeOverlay(staff);
    fireEvent.pointerDown(overlay, { clientX: 60, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 60, clientY: 0, pointerId: 1 });
    expect(onTap).toHaveBeenLastCalledWith(8, { nearestNote: undefined });
  });

  it('drops the ghost when the press is cancelled', async () => {
    const onTap = vi.fn();
    const { staff } = await renderStaff({ onTapPosition: onTap });
    const overlay = sizeOverlay(staff);
    fireEvent.pointerDown(overlay, { clientX: 60, clientY: 40, pointerId: 1 });
    expect(within(staff).getByTestId('staff-ghost')).toBeInTheDocument();
    fireEvent.pointerCancel(overlay, { pointerId: 1 });
    expect(within(staff).queryByTestId('staff-ghost')).toBeNull();
    fireEvent.pointerUp(overlay, { clientX: 60, clientY: 40, pointerId: 1 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it('reports the nearest note to a press', async () => {
    const onTap = vi.fn();
    const notes = PHRASE.slice(0, 3);
    const { staff } = await renderStaff({ notes, onTapPosition: onTap });
    const overlay = sizeOverlay(staff);
    const x = Number(within(staff).getAllByRole('img')[2]!.getAttribute('data-x'));
    fireEvent.pointerDown(overlay, { clientX: x + 1, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: x + 1, clientY: 40, pointerId: 1 });
    expect(onTap).toHaveBeenCalledWith(expect.any(Number), { nearestNote: 2 });
  });

  it('picks a position from the keyboard, arrows moving between lines and spaces', async () => {
    const onTap = vi.fn();
    const user = userEvent.setup();
    const { staff } = await renderStaff({ onTapPosition: onTap });
    const buttons = within(staff).getAllByRole('button');
    // One tab stop: the middle line.
    expect(buttons.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-position', '4');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAccessibleName('space 3');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toHaveAccessibleName('line 2');
    await user.keyboard('{PageDown}');
    expect(document.activeElement).toHaveAccessibleName('line 1');
    await user.keyboard('{Enter}');
    expect(onTap).toHaveBeenLastCalledWith(0, { nearestNote: undefined });
    await user.keyboard('{ArrowUp} ');
    expect(onTap).toHaveBeenLastCalledWith(1, { nearestNote: undefined });
    expect(within(staff).getByRole('button', { name: 'space 1' })).toHaveAttribute('tabindex', '0');
  });

  it('picks a position from a click on its own (VoiceOver activation)', async () => {
    const onTap = vi.fn();
    const { staff } = await renderStaff({ onTapPosition: onTap });
    fireEvent.click(within(staff).getByRole('button', { name: 'space 4' }));
    expect(onTap).toHaveBeenCalledWith(7, { nearestNote: undefined });
  });

  it('lets the caller name positions', async () => {
    const { staff } = await renderStaff({
      onTapPosition: () => {},
      positionRange: [0, 2],
      positionLabel: (p) => `spot ${p}`,
    });
    expect(
      within(staff)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['spot 2', 'spot 1', 'spot 0']);
  });
});

describe('<Staff> sizing', () => {
  it('keeps an interactive staff large enough for 44pt line gaps', async () => {
    const { staff } = await renderStaff({ onTapPosition: () => {} });
    const viewBox = staff.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    const min = parseFloat(staff.style.getPropertyValue('--staff-min'));
    expect(min / viewBox[2]!).toBeGreaterThanOrEqual(4.4);
  });

  it('lays out the overlay before VexFlow arrives', () => {
    render(<Staff label="Fresh" onTapPosition={() => {}} />);
    const staff = screen.getByRole('group', { name: 'Fresh' });
    // Hit bands come from the pure geometry, so they are there at once.
    expect(within(staff).getAllByRole('button').length).toBeGreaterThan(0);
  });
});
