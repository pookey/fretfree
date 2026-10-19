import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { NumeralsContextPanel } from './ContextPanel';
import numerals from './drill';
import { d11MakePrompt, type D11Prompt } from './logic';

const prompt = (id = 'numeral:vi@key=Eb') =>
  d11MakePrompt(
    { id, skillId: 'C8.numerals-major' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function panel(p: D11Prompt, guideLevel: GuideLevel, guided = false) {
  return render(
    <NumeralsContextPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={guided}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={null}
    />,
  );
}

describe('<NumeralsContextPanel>', () => {
  it('is the D11 plugin’s context panel, loaded on first use', async () => {
    expect(await resolveView(numerals.contextPanel!)).toBe(NumeralsContextPanel);
  });

  it('names the method at level 1, without the pattern or scale', () => {
    panel(prompt(), 1);
    expect(screen.getByRole('heading', { name: 'Roman numerals' })).toBeInTheDocument();
    expect(screen.getByText('Count up the scale from E♭ as 1.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByTestId('d11-scale')).toBeNull();
  });

  it('adds the key’s quality pattern at level 2', () => {
    panel(prompt(), 2);
    const pattern = screen.getByRole('list', { name: 'Chords in a major key' });
    expect(pattern).toHaveTextContent('IiiiiiIVVvivii°');
    expect(screen.getByText(/upper case is major/)).toBeInTheDocument();
    expect(screen.queryByTestId('d11-scale')).toBeNull();
  });

  it('adds the scale at level 3 and in the worked example', () => {
    const { unmount } = panel(prompt(), 3);
    expect(screen.getByTestId('d11-scale')).toHaveTextContent('E♭ major: E♭ F G A♭ B♭ C D');
    unmount();
    panel(prompt(), 0, true);
    expect(screen.getByTestId('d11-scale')).toBeInTheDocument();
  });

  it('writes the pattern in Nashville numbers for a Nashville card', () => {
    panel(prompt('nashville:6m@key=D'), 2);
    expect(screen.getByRole('heading', { name: 'Nashville numbers' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent('12m3m456m7°');
    expect(screen.getByText(/m is minor/)).toBeInTheDocument();
  });

  it('names a minor key’s pattern', () => {
    panel(prompt('numeral:bVII@key=Am'), 2);
    expect(screen.getByRole('list', { name: 'Chords in a minor key' })).toHaveTextContent('♭VII');
  });
});
