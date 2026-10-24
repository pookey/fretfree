import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Element as VexElement } from 'vexflow/bravura';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { StaffNameContextPanel } from './ContextPanel';
import { D22View } from './D22View';
import { D22_ID, d22Check, d22MakePrompt, type D22Answer, type D22Prompt } from './logic';

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

const prompt = (id: string, scopeLevel = 0) =>
  d22MakePrompt(
    { id, skillId: 'R1.staff' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

const fb = (p: D22Prompt, answer: D22Answer): DrillFeedback<D22Answer> => ({
  answer,
  result: d22Check(p, answer),
});

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D22Answer> | null;
}

function renderView(p: D22Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D22View
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

const letters = () =>
  within(screen.getByRole('group', { name: /Name this note|This is/ })).getAllByRole('button');

describe('D22View reading', () => {
  it('shows one note to name, by place only, with A–G answers', async () => {
    const { onAnswer } = renderView(prompt('staff:E4@treble8vb'));
    expect(screen.getByText('Name this note')).toBeInTheDocument();
    expect(letters().map((b) => b.textContent)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(letters()[2]).toHaveAttribute('aria-keyshortcuts', 'E');
    const staff = screen.getByRole('group', { name: 'Staff: the note to name' });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    // VoiceOver hears where the note is, not its name.
    expect(within(staff).getByRole('img')).toHaveAccessibleName('whole note on space 4');
    // The neck waits under the staff, empty.
    expect(screen.getByTestId('d22-neck')).toBeInTheDocument();
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'F' }));
    expect(onAnswer).toHaveBeenCalledWith('F');
  });

  it('answers from a hardware keyboard, A–G in either case', () => {
    const { onAnswer } = renderView(prompt('staff:G3@treble8vb'));
    fireEvent.keyDown(window, { key: 'g' });
    expect(onAnswer).toHaveBeenCalledWith('G');
    fireEvent.keyDown(window, { key: 'h' });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('works a new note through, naming it', () => {
    renderView(prompt('staff:G3@treble8vb'), { guided: true });
    expect(screen.getByText('This is G, on the 2nd line. Tap G to continue.')).toBeInTheDocument();
  });

  it('marks a miss on the buttons, the staff and the neck', async () => {
    const p = prompt('staff:E4@treble8vb');
    const { onAnswer } = renderView(p, { feedback: fb(p, 'F') });
    expect(screen.getByRole('button', { name: 'F' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'E' })).toHaveAttribute('data-state', 'expected');
    expect(screen.getByTestId('d22-explain')).toHaveTextContent(
      'F is one step above, on the 5th line. E is in the 4th space.',
    );
    const staff = screen.getByRole('group', { name: /^Staff: E, and the note you gave/ });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    const notes = within(staff).getAllByRole('img');
    expect(notes.map((n) => n.getAttribute('data-style'))).toEqual(['correct', 'wrong']);
    expect(notes[0]).toHaveAccessibleName('E 4, whole note');
    expect(
      screen.getByRole('group', { name: 'Fretboard: where E on the staff is played' }),
    ).toBeInTheDocument();
    // Answered: keys do nothing more.
    fireEvent.keyDown(window, { key: 'e' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('keeps the neck for after the answer on a phone', () => {
    const p = prompt('staff:E4@treble8vb');
    renderView(p, { sizeClass: 'compact' });
    expect(screen.queryByTestId('d22-neck')).toBeNull();
  });
});

describe('D22View placing', () => {
  it('asks for a place and takes a tap on a line or space', async () => {
    const p = prompt('staff:G2@treble8vb:place');
    const { onAnswer } = renderView(p);
    expect(screen.getByText('Tap G below the staff')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Name this note/ })).toBeNull();
    // A tall staff to tap: no neck until the answer is in.
    expect(screen.queryByTestId('d22-neck')).toBeNull();
    const staff = screen.getByRole('group', { name: 'Staff: tap a line or space' });
    const bands = within(staff).getAllByRole('button');
    // Below the staff and the bottom line: positions −7 to 0.
    expect(bands).toHaveLength(8);
    fireEvent.click(within(staff).getByRole('button', { name: 'space below the 2nd ledger line' }));
    expect(onAnswer).toHaveBeenCalledWith(-5);
  });

  it('marks the place in the worked example', () => {
    const p = prompt('staff:D3@treble8vb:place');
    renderView(p, { guided: true });
    expect(
      screen.getByText('D here is in the space below the staff, marked. Tap it to continue.'),
    ).toBeInTheDocument();
    const mark = screen.getByTestId('staff-mark');
    expect(mark).toHaveAttribute('data-position', '-1');
    expect(mark).toHaveAttribute('data-style', 'selected');
  });

  it('draws the note and the neck once answered', async () => {
    const p = prompt('staff:E2@treble8vb:place');
    renderView(p, { feedback: fb(p, -6) });
    expect(screen.getByTestId('d22-explain')).toHaveTextContent(
      "You tapped the 3rd ledger line below: that's F.",
    );
    const staff = screen.getByRole('group', { name: /^Staff: E/ });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    expect(within(staff).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByTestId('d22-neck')).toBeInTheDocument();
  });
});

describe('D22 context panel', () => {
  it('fades from the full map to the anchors', () => {
    const panel = (level: GuideLevel) => render(<StaffNameContextPanel guideLevel={level} />);
    const full = panel(3);
    expect(full.container).toHaveTextContent('E G B D F');
    expect(full.container).toHaveTextContent('D C B A G F E');
    full.unmount();
    const two = panel(2);
    expect(two.container).toHaveTextContent('F A C E');
    expect(two.container).not.toHaveTextContent('D C B A G F E');
    two.unmount();
    const one = panel(1);
    expect(one.container).toHaveTextContent('G line');
    expect(one.container).not.toHaveTextContent('E G B D F');
  });
});

describe('D22 plugin', () => {
  it('registers for R1 with lazy views', async () => {
    const drill = getDrill(D22_ID)!;
    expect(drill.skills).toEqual(['R1.staff', 'R1.ledger-below', 'R1.ledger-above']);
    expect(drill.inputModes).toContain('keyboard');
    await drill.logic.preload();
    expect(await resolveView(drill.render)).toBe(D22View);
    expect(await resolveView(drill.contextPanel!)).toBe(StaffNameContextPanel);
  });
});
