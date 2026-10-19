import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { ProgressionContextPanel } from './ContextPanel';
import { d12Check, d12MakePrompt, type D12Prompt } from './logic';

const prompt = (id: string) =>
  d12MakePrompt(
    { id, skillId: 'C9.pop' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function renderPanel(p: D12Prompt, guideLevel: GuideLevel, opts: { answered?: boolean } = {}) {
  const feedback = opts.answered
    ? { answer: { chords: p.expected }, result: d12Check(p, { chords: p.expected }) }
    : null;
  return render(
    <ProgressionContextPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={feedback}
    />,
  );
}

describe('<ProgressionContextPanel>', () => {
  it('names the progression and its rotation', () => {
    renderPanel(prompt('prog:I-V-vi-IV:build'), 1);
    expect(screen.getByText(/The pop progression/)).toBeInTheDocument();
    expect(screen.getByTestId('d12-rotation-note')).toHaveTextContent(
      'I–V–vi–IV and vi–IV–I–V are rotations: the same chords, started from a different chord.',
    );
    expect(screen.queryByTestId('d12-key-chords')).not.toBeInTheDocument();
  });

  it('lists the key’s chords from level 2, named at full guides or once answered', () => {
    const p = prompt('prog:I-IV-V:build');
    const { rerender } = renderPanel(p, 2);
    const list = screen.getByTestId('d12-key-chords');
    expect(list).toHaveAccessibleName('Chords in the key, by numeral');
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    expect(within(list).queryByText('Dm')).not.toBeInTheDocument();
    expect(screen.queryByTestId('d12-rotation-note')).not.toBeInTheDocument();
    rerender(
      <ProgressionContextPanel
        prompt={p}
        guideLevel={1}
        guided
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
    expect(screen.getByRole('list', { name: 'Chords in C major' })).toHaveTextContent('Dm');
  });

  it('keeps a transposition’s name back until level 2 or an answer', () => {
    const p = prompt('prog:I-V-vi-IV:transpose');
    const { unmount } = renderPanel(p, 1);
    expect(screen.queryByText(/I–V–vi–IV/)).not.toBeInTheDocument();
    expect(screen.getByText(/keeps its numeral/)).toBeInTheDocument();
    unmount();
    renderPanel(p, 1, { answered: true });
    expect(screen.getByTestId('d12-rotation-note')).toBeInTheDocument();
  });

  it('spells flats in a minor key', () => {
    renderPanel(prompt('prog:i-bVII-bVI-bVII:build'), 3);
    expect(screen.getByText('i–♭VII–♭VI–♭VII')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Chords in A minor' })).toHaveTextContent('♭VII');
  });
});
