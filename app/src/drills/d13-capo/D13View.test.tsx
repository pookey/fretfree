import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel, Handedness } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { CapoContextPanel } from './ContextPanel';
import { D13View } from './D13View';
import { d13Check, d13MakePrompt, type D13Answer, type D13Prompt } from './logic';

/** Returns `values` in turn, then the last one for ever. */
const seq =
  (...values: number[]) =>
  () =>
    (values.length > 1 ? values.shift() : values[0]) ?? 0;

/** Capo 3 at scope 0 (frets 1–4), four buttons. */
const prompt = (id: string, scopeLevel = 0) =>
  d13MakePrompt(
    { id, skillId: 'C10.capo-g-c-d' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: seq(0.6, 0) },
  );

function view(
  p: D13Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    handedness?: Handedness;
    feedback?: DrillFeedback<D13Answer> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 1,
    guided: over.guided ?? false,
    handedness: over.handedness ?? 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
    aside: <aside data-testid="aside" />,
  } as const;
  const utils = render(<D13View {...props} />);
  return { ...utils, onAnswer };
}

const fb = (p: D13Prompt, answer: D13Answer): DrillFeedback<D13Answer> => ({
  answer,
  result: d13Check(p, answer),
});
const neck = () => screen.getByTestId('d13-neck');
const cell = (fret: number) => within(neck()).getAllByRole('listitem')[fret] as HTMLElement;
const buttons = () => within(screen.getByRole('group')).getAllByRole('button');

describe('<D13View>', () => {
  it('asks which key sounds, with the capo on the neck and the answer hidden', () => {
    const p = prompt('capo-sound:G');
    expect(p.capo).toBe(3);
    const { onAnswer } = view(p);
    expect(screen.getByTestId('d13-prompt')).toHaveTextContent(
      'You play G shapes with a capo on fret 3. Which key sounds?',
    );
    expect(screen.getByTestId('d13-hint')).toHaveTextContent(/count up/);
    expect(buttons()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'B flat major' })).toBeInTheDocument();
    // The neck shows the given shapes and the capo, never the sounding key.
    expect(neck()).toHaveAccessibleName('Neck with a capo on fret 3');
    expect(cell(0)).toHaveAccessibleName('Open strings, G shapes');
    expect(cell(3)).toHaveAccessibleName('Fret 3, capo');
    expect(cell(3)).not.toHaveTextContent(/B/);
    expect(within(neck()).getAllByTestId('d13-capo')).toHaveLength(1);
    expect(cell(4)).toHaveAttribute('data-past-capo', 'true');
    // Fret numbers only from guide level 2.
    expect(cell(2)).not.toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'B flat major' }));
    expect(onAnswer).toHaveBeenCalledWith('Bb');
  });

  it('hides the shapes for a shape question and the capo for a fret question', () => {
    const { unmount } = view(prompt('capo-shape:G'));
    expect(cell(0)).toHaveAccessibleName('Open strings');
    expect(cell(3)).toHaveAccessibleName('Fret 3, capo, sounds B flat');
    expect(screen.getByRole('button', { name: 'G major shapes' })).toBeInTheDocument();
    unmount();
    view(prompt('capo-fret:G'), { guideLevel: 2 });
    expect(neck()).toHaveAccessibleName('Neck with no capo shown yet');
    expect(within(neck()).queryByTestId('d13-capo')).toBeNull();
    expect(cell(0)).toHaveAccessibleName('Open strings, G shapes');
    expect(cell(3)).toHaveAccessibleName('Fret 3');
    expect(cell(2)).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'fret 3' })).toBeInTheDocument();
  });

  it('names every rung and explains the wrong way in feedback', () => {
    const p = prompt('capo-sound:G');
    view(p, { feedback: fb(p, 'E') });
    expect(screen.getByTestId('d13-summary')).toHaveTextContent(
      'A capo on fret 3 raises G shapes 3 half steps: G → A♭ → A → B♭. They sound in B♭ major.',
    );
    expect(screen.getByTestId('d13-hint')).toHaveTextContent('E is 3 half steps below G.');
    expect(cell(1)).toHaveAccessibleName('Fret 1, A flat');
    expect(cell(3)).toHaveAccessibleName('Fret 3, capo, sounds B flat');
    expect(screen.getByRole('button', { name: 'E major' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'B flat major' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    for (const b of buttons()) expect(b).toBeDisabled();
  });

  it('marks a right answer without an explanation', () => {
    const p = prompt('capo-fret:G');
    view(p, { feedback: fb(p, '3') });
    expect(screen.getByRole('button', { name: 'fret 3' })).toHaveAttribute('data-state', 'correct');
    expect(screen.getByTestId('d13-hint')).toBeEmptyDOMElement();
    expect(within(neck()).getAllByTestId('d13-capo')).toHaveLength(1);
  });

  it('shows the worked example on a guided rep', () => {
    view(prompt('capo-shape:G'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d13-prompt')).toHaveTextContent(
      'They sound in B♭ major. Tap G to continue.',
    );
    expect(cell(0)).toHaveAccessibleName('Open strings, G shapes');
    expect(cell(2)).toHaveTextContent('2');
  });

  it('drops the hint at guide level 0', () => {
    view(prompt('capo-sound:G'), { guideLevel: 0 });
    expect(screen.getByTestId('d13-hint')).toBeEmptyDOMElement();
  });

  it('answers from the keyboard, typing a sharp by pitch', () => {
    const p = prompt('capo-sound:G', 2);
    const { onAnswer } = view(p);
    fireEvent.keyDown(window, { key: 'A' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('d13-hint')).toHaveTextContent('Typed A. Press Enter to answer.');
    fireEvent.keyDown(window, { key: '#' });
    expect(onAnswer).toHaveBeenCalledWith('Bb');
  });

  it('ignores modified keys, Enter with nothing typed, and keys after an answer', () => {
    const p = prompt('capo-fret:G');
    const { onAnswer, rerender } = view(p);
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'z' });
    expect(onAnswer).not.toHaveBeenCalled();
    rerender(
      <D13View
        prompt={p}
        guideLevel={1}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={fb(p, '3')}
        onAnswer={onAnswer}
      />,
    );
    fireEvent.keyDown(window, { key: '3' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('places the context panel beside the question on iPad landscape, below elsewhere', () => {
    const { unmount } = view(prompt('capo-sound:G'));
    const top = screen.getByTestId('d13-drill').firstElementChild as HTMLElement;
    expect(within(top).getByTestId('aside')).toBeInTheDocument();
    unmount();
    view(prompt('capo-sound:G'), { sizeClass: 'compact', handedness: 'left' });
    expect(screen.getByTestId('d13-drill').lastElementChild).toHaveAttribute(
      'data-testid',
      'aside',
    );
    expect(neck()).toHaveAttribute('data-handedness', 'left');
  });
});

describe('<CapoContextPanel>', () => {
  const panel = (p: D13Prompt, guideLevel: GuideLevel, guided = false) =>
    render(
      <CapoContextPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('explains the capo and lists the half steps to count on', () => {
    panel(prompt('capo-shape:G'), 1);
    expect(screen.getByRole('heading', { name: 'How a capo works' })).toBeInTheDocument();
    expect(screen.getByText(/count down one half step per fret/)).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'The twelve half steps' }));
    expect(steps.getAllByRole('listitem')).toHaveLength(12);
    expect(steps.getByText('A♯/B♭')).toBeInTheDocument();
    // Both directions side by side only from level 2.
    expect(screen.queryByText(/Song → shapes/)).toBeNull();
  });

  it('adds both directions from level 2 and on a worked example', () => {
    const { unmount } = panel(prompt('capo-sound:G'), 2);
    expect(screen.getByText(/Song → shapes/)).toBeInTheDocument();
    unmount();
    panel(prompt('capo-sound:G'), 1, true);
    expect(screen.getByText(/Song → shapes/)).toBeInTheDocument();
  });
});
