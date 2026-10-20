import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { KeySignatureContextPanel } from './ContextPanel';
import { D40View } from './D40View';
import { d40Check, d40MakePrompt, type D40Answer, type D40Prompt } from './logic';

const prompt = (id = 'key-signature:Eb', r = 0) =>
  d40MakePrompt(
    { id, skillId: 'I3.flat-signatures' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => r },
  );

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D40Answer> | null;
}

function renderView(p: D40Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const utils = render(
    <D40View
      prompt={p}
      guideLevel={3}
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

const answers = () => within(screen.getByRole('group')).getAllByRole('button');
const fb = (p: D40Prompt, answer: D40Answer) => ({ answer, result: d40Check(p, answer) });

describe('<D40View>', () => {
  it('is registered as the key-signature drill for every I3 skill', async () => {
    const drill = getDrill('key-signature');
    expect(await resolveView(drill!.render)).toBe(D40View);
    expect(await resolveView(drill!.contextPanel!)).toBe(KeySignatureContextPanel);
    expect(drill!.skills).toEqual([
      'I3.sharp-signatures',
      'I3.flat-signatures',
      'I3.dominants',
      'I3.relative-minors',
    ]);
  });

  it('asks for a key’s signature with buttons that show which notes', () => {
    const { onAnswer } = renderView(prompt());
    expect(screen.getByTestId('d40-subject')).toHaveTextContent('E♭ major');
    expect(screen.getByText('How many sharps or flats?')).toBeVisible();
    // A run from 3: 3♯ 3♭ 4♯ 4♭, each with its notes.
    expect(answers().map((b) => b.getAttribute('aria-label'))).toEqual([
      '3 sharps: F sharp, C sharp, G sharp',
      '3 flats: B flat, E flat, A flat',
      '4 sharps: F sharp, C sharp, G sharp, D sharp',
      '4 flats: B flat, E flat, A flat, D flat',
    ]);
    const flats = screen.getByRole('button', { name: /^3 flats/ });
    expect(flats).toHaveTextContent('3♭B♭ E♭ A♭');
    fireEvent.click(flats);
    expect(onAnswer).toHaveBeenCalledWith('3b');
  });

  it('answers from the number row', () => {
    const { onAnswer } = renderView(prompt());
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith('3b');
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    fireEvent.keyDown(window, { key: '9' });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('asks the reverse, and for the relative minor and the V, by name', () => {
    renderView(prompt('signature-key:3b'));
    expect(screen.getByTestId('d40-subject')).toHaveTextContent('3 flats');
    expect(screen.getByRole('button', { name: 'E flat major' })).toHaveTextContent('E♭');
    expect(screen.queryByText(/E♭ major/)).toBeNull();
  });

  it('names the relative minor buttons as minor keys', () => {
    renderView(prompt('relative-minor:Eb'));
    expect(screen.getByText('Its relative minor?')).toBeVisible();
    expect(screen.getByRole('button', { name: 'C minor' })).toHaveTextContent('Cm');
  });

  it('shows the fact and the reason on the first, guided rep', () => {
    renderView(prompt('dominant:Eb'), { guided: true });
    expect(screen.getByText(/B♭ is the V of E♭ major: a 5th up/)).toBeVisible();
    expect(screen.getByText(/to continue/)).toHaveTextContent('Tap B♭ to continue.');
  });

  it('marks a wrong answer and the right one by edge as well as colour, and says why', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, '3#') });
    const picked = screen.getByRole('button', { name: /^3 sharps/ });
    const right = screen.getByRole('button', { name: /^3 flats/ });
    expect(picked).toHaveAttribute('data-state', 'wrong');
    expect(right).toHaveAttribute('data-state', 'expected');
    for (const b of answers()) expect(b).toBeDisabled();
    const feedback = screen.getByTestId('d40-feedback');
    expect(feedback).toHaveTextContent('3 sharps is A major.');
    expect(feedback).toHaveTextContent('E♭ major has 3 flats: B♭ E♭ A♭.');
  });

  it('names the fact after a right answer too', () => {
    const p = prompt('relative-minor:C');
    renderView(p, { feedback: fb(p, 'A') });
    expect(screen.getByRole('button', { name: 'A minor' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    expect(screen.getByTestId('d40-feedback')).toHaveTextContent(
      'A minor is the relative minor of C major',
    );
  });

  it('puts the panel beside the card on iPad landscape, below it elsewhere', () => {
    const { unmount } = renderView(prompt());
    const upper = screen.getByTestId('context-panel').parentElement;
    expect(upper).not.toBe(screen.getByTestId('d40-drill'));
    unmount();
    renderView(prompt(), { sizeClass: 'compact' });
    expect(screen.getByTestId('context-panel').parentElement).toBe(screen.getByTestId('d40-drill'));
  });
});

describe('<KeySignatureContextPanel>', () => {
  function panel(p: D40Prompt, guideLevel: GuideLevel, guided = false) {
    return render(
      <KeySignatureContextPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
  }

  it('fades from the circle order to the orders of sharps and flats', () => {
    const { unmount } = panel(prompt('signature-key:3b'), 2);
    expect(screen.getByText(/second-last flat names the key/)).toBeVisible();
    expect(screen.getByText('B E A D G C F')).toBeVisible();
    expect(screen.getByText('C G D A E B F♯ C♯')).toBeVisible();
    expect(screen.getByText('C F B♭ E♭ A♭ D♭ G♭ C♭')).toBeVisible();
    unmount();
    panel(prompt('signature-key:3b'), 1);
    expect(screen.getByText('B E A D G C F')).toBeVisible();
    expect(screen.queryByText(/^Sharp keys/)).toBeNull();
  });

  it('never lists the keys or the sharps in order for the V, which would be its answer', () => {
    // Guided: the worked example's full guides (level 3).
    panel(prompt('dominant:Eb'), 1, true);
    expect(screen.getByText(/The V is a 5th up/)).toBeVisible();
    expect(screen.queryByText(/^Sharp keys/)).toBeNull();
    expect(screen.queryByText('F C G D A E B')).toBeNull();
  });

  it('shows only its heading at level 0 (the session hides the panel)', () => {
    panel(prompt(), 0);
    expect(screen.getByRole('heading', { name: 'Circle of fifths' })).toBeVisible();
    expect(screen.queryByText(/F C G D A E B/)).toBeNull();
  });
});
