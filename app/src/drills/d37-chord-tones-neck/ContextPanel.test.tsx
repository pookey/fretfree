import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { ChordTonesPanel } from './ContextPanel';
import { D37View } from './D37View';
import chordTonesNeck from './drill';
import { d37Check, d37MakePrompt, type D37Answer, type D37Prompt } from './logic';

const prompt = (id: string, scopeLevel = 0) =>
  d37MakePrompt(
    { id, skillId: 'C5.neck-triads' },
    { tuning: STANDARD_TUNING, accidentalPref: 'flat', scopeLevel, rng: () => 0.5 },
  );

function panel(
  p: D37Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answer?: D37Answer } = {},
) {
  return render(
    <ChordTonesPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answer ? { answer: over.answer, result: d37Check(p, over.answer) } : null}
    />,
  );
}

const tones = () => within(screen.getByRole('list', { name: /^Chord tones of/ }));

describe('D37 plugin', () => {
  it('is registered with its lazy view and context panel', async () => {
    expect(chordTonesNeck.id).toBe('chord-tones-neck');
    expect(chordTonesNeck.skills).toEqual(['C5.neck-triads', 'C5.neck-sevenths']);
    expect(await resolveView(chordTonesNeck.render)).toBe(D37View);
    expect(await resolveView(chordTonesNeck.contextPanel!)).toBe(ChordTonesPanel);
  });
});

describe('<ChordTonesPanel>', () => {
  it('lists the formula with each degree’s marker, and the notes from guide level 2', () => {
    const p = prompt('chord-tones:Cm7');
    const { unmount } = panel(p, 1);
    expect(screen.getByRole('heading', { name: 'Chord tones of Cm7' })).toBeVisible();
    expect(
      tones()
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['R', '♭3', '5', '♭7']);
    expect(tones().getByLabelText('flat 3rd')).toBeVisible();
    unmount();
    panel(p, 2);
    expect(
      tones()
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['RC', '♭3E♭', '5G', '♭7B♭']);
  });

  it('marks the asked degree and names the shape only once answered', () => {
    const p = prompt('chord-tones:3@C');
    const { unmount } = panel(p, 3);
    expect(tones().queryByRole('listitem', { current: true })).toBeNull();
    expect(screen.queryByText(/shape of C major/)).toBeNull();
    unmount();
    panel(p, 3, { answer: p.targets });
    expect(tones().getByRole('listitem', { current: true })).toHaveTextContent('3E');
    expect(
      screen.getByText(`These frets are the ${p.shape!.name} shape of C major.`),
    ).toBeVisible();
  });

  it('marks every degree of a chord card in a worked example, with no shape on the neck', () => {
    const p = prompt('chord-tones:G', 1);
    panel(p, 0, { guided: true });
    expect(tones().getAllByRole('listitem', { current: true })).toHaveLength(3);
    expect(screen.queryByText(/shape of/)).toBeNull();
  });
});
