import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Element as VexElement } from 'vexflow/bravura';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { StaffIntervalContextPanel } from './ContextPanel';
import { StaffIntervalView } from './StaffIntervalView';
import { STAFF_INTERVAL_ID, siCheck, siMakePrompt, type SIAnswer, type SIPrompt } from './logic';

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

const prompt = (id: string, scopeLevel = 0, rng: () => number = () => 0) =>
  siMakePrompt(
    { id, skillId: 'R5.steps-skips' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng },
  );

const fb = (p: SIPrompt, answer: SIAnswer): DrillFeedback<SIAnswer> => ({
  answer,
  result: siCheck(p, answer),
});

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<SIAnswer> | null;
}

function renderView(p: SIPrompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <StaffIntervalView
      prompt={p}
      guideLevel={2}
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

const answers = () =>
  within(screen.getByRole('group', { name: /Name the interval|to continue/ })).getAllByRole(
    'button',
  );

describe('StaffIntervalView reading', () => {
  it('shows the pair by place only, with 2nd to octave answers', async () => {
    const { onAnswer } = renderView(prompt('staff-interval:+3@treble8vb'));
    expect(screen.getByText('Name the interval')).toBeInTheDocument();
    expect(answers().map((b) => b.textContent)).toEqual([
      '2nd step',
      '3rd skip',
      '4th',
      '5th',
      '6th',
      '7th',
      'Octave',
    ]);
    expect(answers()[0]).toHaveAttribute('aria-keyshortcuts', '2');
    const staff = screen.getByRole('group', { name: 'Staff: the two notes to name' });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    // VoiceOver hears where the notes are, not their names.
    expect(
      within(staff)
        .getAllByRole('img')
        .map((n) => n.getAttribute('aria-label')),
    ).toEqual(['whole note on space below the staff', 'whole note on space 1']);
    // Alone, the pair isn't marked: it is all there is.
    for (const n of within(staff).getAllByRole('img')) {
      expect(n).toHaveAttribute('data-style', 'plain');
    }
    expect(screen.getByTestId('si-neck')).toBeInTheDocument();
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3rd skip' }));
    expect(onAnswer).toHaveBeenCalledWith('3rd');
  });

  it('marks the pair inside a phrase from scope level 1', async () => {
    const p = prompt('staff-interval:+3@treble8vb', 1, () => 0.5);
    renderView(p);
    expect(screen.getByText('Name the interval between the marked notes')).toBeInTheDocument();
    const staff = screen.getByRole('group', { name: /a phrase/ });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    const styles = within(staff)
      .getAllByRole('img')
      .map((n) => n.getAttribute('data-style'));
    expect(styles).toHaveLength(4);
    expect(styles[p.pairAt]).toBe('target');
    expect(styles[p.pairAt + 1]).toBe('target');
    expect(styles.filter((s) => s === 'target')).toHaveLength(2);
  });

  it('takes the number keys, and O for the octave', () => {
    const { onAnswer } = renderView(prompt('staff-interval:+3@treble8vb'));
    fireEvent.keyDown(window, { key: '4' });
    expect(onAnswer).toHaveBeenLastCalledWith('4th');
    fireEvent.keyDown(window, { key: 'o' });
    expect(onAnswer).toHaveBeenLastCalledWith('Octave');
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    fireEvent.keyDown(window, { key: '9' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('works the first card through, naming the answer', () => {
    renderView(prompt('staff-interval:+2@treble8vb'), { guided: true });
    expect(screen.getByText(/^Space to line: count both notes, 1, 2\./)).toBeInTheDocument();
  });

  it('marks a miss, the right answer, and where the answer reached', async () => {
    const p = prompt('staff-interval:+3@treble8vb');
    renderView(p, { feedback: fb(p, '4th') });
    expect(screen.getByRole('button', { name: '4th' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: '3rd skip' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    for (const b of answers()) expect(b).toBeDisabled();
    expect(screen.getByTestId('si-explain')).toHaveTextContent(
      'A 4th would be space to line, one place further.',
    );
    const staff = screen.getByRole('group', { name: /where your answer reached/ });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    expect(
      within(staff)
        .getAllByRole('img')
        .map((n) => n.getAttribute('data-style')),
    ).toEqual(['correct', 'correct']);
    expect(within(staff).getByTestId('staff-mark')).toHaveAttribute('data-position', '2');
    // The neck shows the pair and the note the miss named.
    const neck = within(screen.getByTestId('si-neck'));
    expect(neck.getByRole('group', { name: /D to F, as played/ })).toBeInTheDocument();
  });

  it('marks a right answer without a miss mark', async () => {
    const p = prompt('staff-interval:+3@treble8vb');
    renderView(p, { feedback: fb(p, '3rd') });
    expect(screen.getByRole('button', { name: '3rd skip' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    const staff = screen.getByRole('group', { name: 'Staff: the interval' });
    expect(within(staff).queryByTestId('staff-mark')).toBeNull();
    expect(screen.getByTestId('si-explain')).toHaveTextContent('D to F, space to space');
  });

  it('keeps the neck off a phone until the answer is in', () => {
    const p = prompt('staff-interval:+3@treble8vb');
    renderView(p, { sizeClass: 'compact' });
    expect(screen.queryByTestId('si-neck')).toBeNull();
    // The panel follows the drill there.
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
  });
});

describe('StaffIntervalView placing', () => {
  it('shows the start note on a staff that takes a tap', () => {
    const p = prompt('staff-interval:+2@treble8vb:place', 0, () => 0.5);
    const { onAnswer } = renderView(p);
    expect(screen.getByText('Tap the note a 2nd above')).toBeInTheDocument();
    expect(screen.queryByTestId('si-neck')).toBeNull();
    const staff = screen.getByRole('group', { name: 'Staff: tap a line or space' });
    fireEvent.click(within(staff).getByRole('button', { name: 'space 3' }));
    expect(onAnswer).toHaveBeenCalledWith(5);
  });

  it('marks the place on the worked example', () => {
    const p = prompt('staff-interval:+2@treble8vb:place', 0, () => 0.5);
    renderView(p, { guided: true });
    expect(screen.getByText(/Tap the marked place to continue\.$/)).toBeInTheDocument();
    expect(screen.getByTestId('staff-mark')).toHaveAttribute('data-position', '5');
  });

  it('completes the pair once answered, and marks a wrong tap', async () => {
    const p = prompt('staff-interval:+2@treble8vb:place', 0, () => 0.5);
    renderView(p, { feedback: fb(p, 6) });
    expect(screen.getByTestId('si-explain')).toHaveTextContent('You tapped a 3rd above');
    const staff = screen.getByRole('group', { name: /where your answer reached/ });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    expect(within(staff).getAllByRole('img')).toHaveLength(2);
    expect(within(staff).getByTestId('staff-mark')).toHaveAttribute('data-position', '6');
    expect(screen.getByTestId('si-neck')).toBeInTheDocument();
  });

  it("doesn't mark the start note itself as the answer's place", () => {
    const p = prompt('staff-interval:+2@treble8vb:place', 0, () => 0.5);
    renderView(p, { feedback: fb(p, p.from) });
    expect(screen.queryByTestId('staff-mark')).toBeNull();
  });
});

describe('StaffIntervalContextPanel', () => {
  const panel = (guideLevel: GuideLevel) =>
    render(<StaffIntervalContextPanel guideLevel={guideLevel} />);

  it('fades from counting to the line-or-space rule', () => {
    const { rerender } = panel(3);
    expect(screen.getByText(/Count the lines and spaces/)).toBeInTheDocument();
    expect(screen.getByText(/moves from a line to the space next to it/)).toBeInTheDocument();
    rerender(<StaffIntervalContextPanel guideLevel={2} />);
    expect(screen.queryByText(/Count the lines and spaces/)).toBeNull();
    expect(screen.getByText(/moves from a line/)).toBeInTheDocument();
    rerender(<StaffIntervalContextPanel guideLevel={1} />);
    expect(screen.queryByText(/moves from a line/)).toBeNull();
    expect(screen.getByText(/line to line, or space to space/)).toBeInTheDocument();
  });
});

describe('the registered drill', () => {
  it('renders its lazy view and panel', async () => {
    const drill = getDrill(STAFF_INTERVAL_ID)!;
    expect(drill.title).toBe('Name the step or skip');
    await drill.logic.preload();
    const View = await resolveView(drill.render);
    expect(View).toBe(StaffIntervalView);
    const Panel = await resolveView(drill.contextPanel!);
    expect(Panel).toBe(StaffIntervalContextPanel);
  });
});
