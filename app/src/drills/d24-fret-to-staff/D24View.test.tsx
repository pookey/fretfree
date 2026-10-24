import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Element as VexElement } from 'vexflow/bravura';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { FretToStaffContextPanel } from './ContextPanel';
import { D24View } from './D24View';
import { D24_ID, d24Check, d24MakePrompt, type D24Answer, type D24Prompt } from './logic';

// jsdom has no canvas; give VexFlow a stand-in to measure glyphs with, as Staff.test does.
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

const prompt = (id: string, rng = 0) =>
  d24MakePrompt(
    { id, skillId: 'R2.pos5' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => rng },
  );

const fb = (p: D24Prompt, answer: D24Answer): DrillFeedback<D24Answer> => ({
  answer,
  result: d24Check(p, answer),
});

interface Opts {
  guided?: boolean;
  guideLevel?: GuideLevel;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D24Answer> | null;
}

function renderView(p: D24Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D24View
      prompt={p}
      guideLevel={opts.guideLevel ?? 1}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass={opts.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={<aside data-testid="context-panel" />}
    />,
  );
  return { onAnswer, ...utils };
}

const staff = () => within(screen.getByTestId('d24-staff')).getByRole('group');
const neck = () => screen.getByTestId('d24-neck');
const marks = () =>
  within(screen.getByTestId('d24-staff'))
    .queryAllByTestId('staff-mark')
    .map((m) => [m.getAttribute('data-style'), Number(m.getAttribute('data-position'))]);

describe('D24View', () => {
  const g3 = prompt('fret→staff:G3@pos5');

  it('lights the fret and takes a tap on the staff', async () => {
    const { onAnswer } = renderView(g3);
    expect(screen.getByTestId('d24-position')).toHaveTextContent('5th position, frets 5–8');
    expect(screen.getByTestId('d24-prompt')).toHaveTextContent(
      'Place string 4, fret 5 on the staff',
    );
    // The lit cell, unlabelled: its name is the answer's first half.
    const lit = within(neck()).getByTestId('marker-target');
    expect(lit).toHaveAttribute('data-string', '4');
    expect(lit).toHaveAttribute('data-fret', '5');
    expect(lit.querySelector('text')).toBeNull();
    expect(within(neck()).getAllByTestId(/^marker-/)).toHaveLength(1);
    // Only the position's frets are drawn, fret numbers on at every level.
    expect(neck().querySelector('svg')).toHaveAttribute('data-fret-from', '4');
    expect(neck().querySelector('svg')).toHaveAttribute('data-guide-level', '2');

    await waitFor(() => expect(staff()).toHaveAttribute('data-ready', 'true'));
    expect(staff()).toHaveAccessibleName('Staff: tap the line or space for the lit fret');
    expect(screen.getByTestId('d24-staff')).toHaveAttribute('data-range', '-5:13');
    expect(marks()).toEqual([]);
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    fireEvent.click(within(staff()).getByRole('button', { name: 'space 2' }));
    expect(onAnswer).toHaveBeenCalledWith(3);
  });

  it('works the example: the note named, its place marked and its cell labelled', () => {
    renderView(g3, { guided: true });
    expect(screen.getByTestId('d24-prompt')).toHaveTextContent(
      'String 4, fret 5 is G3, on the 2nd line, marked. Tap it to continue.',
    );
    expect(marks()).toEqual([['selected', 2]]);
    expect(within(neck()).getByTestId('marker-target')).toHaveTextContent('G');
  });

  it('marks a miss beside the right place, and both notes’ frets on the neck', async () => {
    const { onAnswer } = renderView(g3, { feedback: fb(g3, 3) });
    expect(marks()).toEqual([
      ['correct', 2],
      ['wrong', 3],
    ]);
    expect(staff()).toHaveAccessibleName(
      'Staff: G3, on the 2nd line, and your tap, A3, in the 2nd space',
    );
    const right = within(neck()).getByTestId('marker-correct');
    expect([right.dataset.string, right.dataset.fret]).toEqual(['4', '5']);
    expect(right).toHaveTextContent('G');
    const wrong = within(neck()).getByTestId('marker-wrong');
    expect([wrong.dataset.string, wrong.dataset.fret]).toEqual(['4', '7']);
    expect(wrong).toHaveTextContent('A');
    expect(screen.getByTestId('d24-explain')).toHaveTextContent(
      "You tapped the 2nd space: that's A3, one step above, played on string 4, fret 7.",
    );
    // Feedback is final: another tap does nothing.
    await waitFor(() => expect(staff()).toHaveAttribute('data-ready', 'true'));
    fireEvent.click(within(staff()).getByRole('button', { name: 'line 2' }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('marks a right answer alone', () => {
    renderView(g3, { feedback: fb(g3, 2) });
    expect(marks()).toEqual([['correct', 2]]);
    expect(staff()).toHaveAccessibleName('Staff: G3, on the 2nd line');
    expect(within(neck()).queryByTestId('marker-wrong')).toBeNull();
    expect(screen.getByTestId('d24-explain')).toHaveTextContent(
      'String 4, fret 5 is G3, on the 2nd line.',
    );
  });

  it('shows both of 9th position’s cells for F3 once answered', () => {
    const f3 = prompt('fret→staff:F3@pos9', 0.99);
    renderView(f3, { feedback: fb(f3, f3.place) });
    expect(
      within(neck())
        .getAllByTestId('marker-correct')
        .map((m) => `s${m.dataset.string}f${m.dataset.fret}`),
    ).toEqual(['s6f13', 's5f8']);
  });

  it('moves a hardware keyboard into the staff on the first arrow key', async () => {
    const { onAnswer } = renderView(g3);
    await waitFor(() => expect(staff()).toHaveAttribute('data-ready', 'true'));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const focused = document.activeElement as Element;
    expect(focused.getAttribute('role')).toBe('button');
    expect(staff()).toContainElement(focused as HTMLElement);
    fireEvent.keyDown(focused, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith(Number(focused.getAttribute('data-position')));
    // Keys with a modifier, and other keys, are left alone.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true });
    fireEvent.keyDown(window, { key: 'x' });
    expect(document.activeElement).toBe(document.body);
  });

  it('lays out by size class, with a hint only where there is room', () => {
    const { unmount } = renderView(g3, { sizeClass: 'compact' });
    expect(screen.getByTestId('d24-drill')).toHaveAttribute('data-size-class', 'compact');
    expect(screen.getByTestId('d24-explain')).toBeEmptyDOMElement();
    unmount();
    renderView(g3, { sizeClass: 'regular' });
    expect(screen.getByTestId('d24-explain')).toHaveTextContent(
      'Tap the staff, or use the arrow keys',
    );
  });

  it('is the registered drill’s view', async () => {
    const drill = getDrill(D24_ID)!;
    expect(drill.title).toBe('Fretboard → staff');
    expect(drill.inputModes).toEqual(['tap', 'keyboard']);
    await drill.logic.preload();
    expect(await resolveView(drill.render)).toBe(D24View);
    expect(await resolveView(drill.contextPanel!)).toBe(FretToStaffContextPanel);
  });
});

describe('FretToStaffContextPanel', () => {
  const p = prompt('fret→staff:G3@pos5');
  const panel = (guideLevel: GuideLevel) =>
    render(
      <FretToStaffContextPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('fades from the open strings and the staff map to two anchors', () => {
    const { unmount } = panel(3);
    expect(screen.getByText(/String 6/)).toHaveTextContent(
      'String 6, E: in the space below the 3rd ledger line',
    );
    expect(screen.getByText(/String 3/)).toHaveTextContent('String 3, G: on the 2nd line');
    expect(screen.getByText(/Lines, bottom up/)).toBeInTheDocument();
    expect(screen.getByText(/Each fret is a half step/)).toBeInTheDocument();
    unmount();

    const two = panel(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByText(/Each fret is a half step/)).toBeNull();
    two.unmount();

    panel(1);
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.queryByText(/Lines, bottom up/)).toBeNull();
    expect(screen.getByText(/the G line the clef curls round/)).toBeInTheDocument();
  });
});
