import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { keyApplyItemId } from '../../engine/items/key-apply';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { KeySignatureApplyContextPanel } from './ContextPanel';
import { D25View } from './D25View';
import { d25Check, d25MakePrompt, type D25Answer, type D25Prompt } from './logic';

// The staff's engraving is <Staff>'s own concern (M8-02); here it is a stub
// that shows what it was given.
vi.mock('../../components/staff', () => ({
  Staff: ({
    notes,
    keySignature,
    label,
    revealPitches,
  }: {
    notes: { pitches: string[]; style: string }[];
    keySignature: string;
    label: string;
    revealPitches: boolean;
  }) => (
    <div
      data-testid="staff"
      aria-label={label}
      data-key={keySignature}
      data-reveal={String(revealPitches)}
      data-notes={notes.map((n) => `${n.pitches.join('+')}:${n.style}`).join(' ')}
    />
  ),
}));

const prompt = (letter = 'F', alteration = 2): D25Prompt =>
  d25MakePrompt(
    { id: keyApplyItemId(letter, alteration), skillId: 'R3.sharps-few' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

interface Opts {
  guided?: boolean;
  guideLevel?: GuideLevel;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D25Answer> | null;
}

function renderView(p: D25Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D25View
      prompt={p}
      guideLevel={opts.guideLevel ?? 3}
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
  within(screen.getByRole('group', { name: /What is this note|to continue/ })).getAllByRole(
    'button',
  );
const fb = (p: D25Prompt, answer: D25Answer) => ({ answer, result: d25Check(p, answer) });
const neckMarkers = (style: string) => screen.queryAllByTestId(`marker-${style}`);

describe('<D25View>', () => {
  it('is registered as the key-signature-apply drill for every R3 skill', async () => {
    const drill = getDrill('key-signature-apply');
    expect(await resolveView(drill!.render)).toBe(D25View);
    expect(await resolveView(drill!.contextPanel!)).toBe(KeySignatureApplyContextPanel);
    expect(drill!.skills).toEqual([
      'R3.sharps-few',
      'R3.flats-few',
      'R3.sharps-many',
      'R3.flats-many',
    ]);
  });

  it('shows the signature and an unnamed note, with three spellings to pick', () => {
    const { onAnswer } = renderView(prompt());
    const staff = screen.getByTestId('staff');
    expect(staff).toHaveAttribute('data-key', 'D');
    expect(staff).toHaveAttribute('data-notes', 'F#3:target');
    expect(staff).toHaveAttribute('data-reveal', 'false');
    expect(staff.getAttribute('aria-label')).toContain('key signature of 2 sharps');
    expect(screen.getByText('What is this note in this key signature?')).toBeInTheDocument();
    expect(answers().map((b) => b.textContent)).toEqual(['F♭', 'F', 'F♯']);
    expect(answers().map((b) => b.getAttribute('aria-label'))).toEqual(['F flat', 'F', 'F sharp']);
    expect(answers()[2]).toHaveAttribute('aria-keyshortcuts', '3 #');
    // Before the answer the neck shows the position, never the note's fret.
    expect(screen.getByRole('group', { name: /open position shown/ })).toBeInTheDocument();
    expect(neckMarkers('correct')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'F sharp' }));
    expect(onAnswer).toHaveBeenCalledWith('F#');
  });

  it('answers from a hardware keyboard until answered', () => {
    const p = prompt();
    const { onAnswer, rerender } = renderView(p);
    fireEvent.keyDown(window, { key: 'n' });
    expect(onAnswer).toHaveBeenLastCalledWith('F');
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).toHaveBeenLastCalledWith('Fb');
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    fireEvent.keyDown(window, { key: 'x' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
    rerender(
      <D25View
        prompt={p}
        guideLevel={3}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={fb(p, 'F#')}
        onAnswer={onAnswer}
      />,
    );
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('works the first rep as an example: the fact, the answer and its fret', () => {
    renderView(prompt(), { guided: true });
    expect(screen.getByText(/Every F is F♯, in every octave\. Tap/)).toBeInTheDocument();
    expect(screen.getByText('F♯', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByTestId('staff')).toHaveAttribute('data-reveal', 'true');
    expect(neckMarkers('correct')).toHaveLength(1);
  });

  it('marks a wrong answer, explains it and shows both frets', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'F') });
    const [flat, natural, sharp] = answers();
    expect(natural).toHaveAttribute('data-state', 'wrong');
    expect(sharp).toHaveAttribute('data-state', 'expected');
    expect(flat).not.toHaveAttribute('data-state');
    for (const b of answers()) expect(b).toBeDisabled();
    const feedback = screen.getByTestId('d25-feedback');
    expect(feedback).toHaveTextContent('F would need a natural sign');
    expect(feedback).toHaveTextContent('2 sharps: F♯ C♯.');
    expect(screen.getByTestId('staff')).toHaveAttribute('data-notes', 'F#3:wrong');
    expect(neckMarkers('correct')).toHaveLength(1);
    expect(neckMarkers('wrong')).toHaveLength(1);
  });

  it('marks a right answer with the fact alone', () => {
    const p = prompt('G', 2);
    renderView(p, { feedback: fb(p, 'G') });
    expect(answers()[1]).toHaveAttribute('data-state', 'correct');
    expect(screen.getByTestId('d25-feedback')).toHaveTextContent(
      'G isn’t one of them, so it stays G.',
    );
    expect(screen.getByTestId('staff')).toHaveAttribute('data-notes', 'G3:correct');
    expect(neckMarkers('wrong')).toHaveLength(0);
  });

  it('puts the context panel beside the staff on iPad landscape, below elsewhere', () => {
    const { container, unmount } = renderView(prompt());
    const upper = container.querySelector('[data-testid="d25-drill"] > div')!;
    expect(within(upper as HTMLElement).getByTestId('context-panel')).toBeInTheDocument();
    unmount();
    const compact = renderView(prompt(), { sizeClass: 'compact' });
    const drill = compact.container.querySelector('[data-testid="d25-drill"]')!;
    expect(drill.lastElementChild).toHaveAttribute('data-testid', 'context-panel');
  });

  it('names a neck with no position for the note', () => {
    renderView({ ...prompt(), position: null });
    expect(screen.getByRole('group', { name: /fret shown after you answer/ })).toBeInTheDocument();
  });
});

describe('<KeySignatureApplyContextPanel>', () => {
  const panel = (guideLevel: GuideLevel, guided = false) =>
    render(
      <KeySignatureApplyContextPanel
        prompt={prompt()}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('fades from the method to the rule, and never names the signature’s letters', () => {
    const { container, unmount } = panel(3);
    expect(container).toHaveTextContent('every octave');
    expect(container).toHaveTextContent('F C G D A E B');
    expect(container).toHaveTextContent('Count the signs');
    expect(container).not.toHaveTextContent('F♯');
    unmount();
    const two = panel(2);
    expect(two.container).toHaveTextContent('B E A D G C F');
    expect(two.container).not.toHaveTextContent('Count the signs');
    two.unmount();
    const one = panel(1);
    expect(one.container).toHaveTextContent('every octave');
    expect(one.container).not.toHaveTextContent('F C G D A E B');
    one.unmount();
    expect(panel(0, true).container).toHaveTextContent('Count the signs');
  });
});
