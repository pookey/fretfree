import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { FunctionContextPanel } from './ContextPanel';
import fn from './drill';
import { dfMakePrompt, type DfPrompt } from './logic';

const prompt = (id = 'minor-source:V7@key=Am') =>
  dfMakePrompt(
    { id, skillId: 'I4.harmonic-minor' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function panel(p: DfPrompt, guideLevel: GuideLevel, guided = false) {
  return render(
    <FunctionContextPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={guided}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={null}
    />,
  );
}

describe('<FunctionContextPanel>', () => {
  it('is the function drill’s context panel, loaded on first use', async () => {
    expect(await resolveView(fn.contextPanel!)).toBe(FunctionContextPanel);
  });

  it('shows only its heading at level 0', () => {
    panel(prompt(), 0);
    expect(screen.getByRole('heading', { name: 'Minor-key harmony' })).toBeInTheDocument();
    expect(screen.queryByText(/raised/)).toBeNull();
  });

  it('names the method at level 1, then the scales to check against', () => {
    const { unmount } = panel(prompt(), 1);
    expect(screen.getByText(/Is the 7th raised\?/)).toBeInTheDocument();
    expect(screen.queryByText(/natural minor:/)).toBeNull();
    unmount();
    panel(prompt(), 2);
    expect(screen.getByText('A natural minor:')).toHaveTextContent('A B C D E F G');
    expect(screen.queryByText(/harmonic minor:/)).toBeNull();
  });

  it('shows full guides on the worked example', () => {
    panel(prompt(), 0, true);
    expect(screen.getByText('A harmonic minor:')).toHaveTextContent('G♯');
    expect(screen.getByText('A major:')).toBeInTheDocument();
  });

  it('titles each kind', () => {
    const { unmount } = panel(prompt('function:V@major'), 2);
    expect(screen.getByRole('heading', { name: 'Chord function' })).toBeInTheDocument();
    expect(screen.getByText(/^Chords in/)).toBeInTheDocument();
    unmount();
    panel(prompt('tritone-sub:G7'), 2);
    expect(screen.getByRole('heading', { name: 'Substitutes' })).toBeInTheDocument();
  });
});
